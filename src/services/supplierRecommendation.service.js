const clickhouse = require('../config/clickhouse');

function scoreHistoricalSuppliers(rows, minSamples = Number(process.env.AUDIT_MIN_SAMPLES || 5)) {
  if (!rows.length) return [];
  const maxAdvantage = Math.max(...rows.map(r => Number(r.average_price_advantage || 0)), 0);

  return rows.map(row => {
    const sampleSize = Number(row.searches_evaluated || 0);
    const winRate = Number(row.win_rate || 0);
    const availability = Number(row.availability_coverage || 0);
    const advantageRaw = Number(row.average_price_advantage || 0);
    const priceAdvantage = maxAdvantage > 0 ? Math.max(0, Math.min(100, (advantageRaw / maxAdvantage) * 100)) : 50;
    const score = 0.40 * winRate + 0.35 * priceAdvantage + 0.25 * availability;

    let confidence = 'LOW';
    if (sampleSize >= minSamples * 4) confidence = 'HIGH';
    else if (sampleSize >= minSamples) confidence = 'MEDIUM';

    return {
      supplier: row.Supplier,
      searchesEvaluated: sampleSize,
      cheapestWins: Number(row.cheapest_wins || 0),
      winRate: Number(winRate.toFixed(2)),
      averagePriceAdvantageAED: Number(advantageRaw.toFixed(2)),
      availabilityCoverage: Number(availability.toFixed(2)),
      sampleSize,
      recommendationScore: Number(score.toFixed(2)),
      confidence
    };
  }).sort((a, b) => b.recommendationScore - a.recommendationScore || a.supplier.localeCompare(b.supplier));
}

async function getHistoricalRecommendation({ hotelId, mealPlan, cancellationPolicy }) {
  const result = await clickhouse.query({
    query: `WITH dedup AS (
      SELECT * EXCEPT (rn) FROM (
        SELECT *, row_number() OVER (PARTITION BY Search_ID,Hotel_ID,Meal_Plan,Cancellation_Policy,Supplier ORDER BY Ingested_At DESC) rn
        FROM raw_supplier_offers
        WHERE Hotel_ID={hotelId:String} AND Meal_Plan={mealPlan:String} AND Cancellation_Policy={cancellationPolicy:String}
      ) WHERE rn=1
    ), eligible AS (
      SELECT *, sum(Net_Rate_AED) OVER group_window AS eligible_sum,
             count() OVER group_window AS eligible_count,
             min(Net_Rate_AED) OVER group_window AS cheapest_rate
      FROM dedup
      WHERE Available='Yes' AND Supplier_Status='AVAILABLE'
        AND Net_Rate_AED IS NOT NULL AND Net_Rate_AED>0 AND Currency='AED'
      WINDOW group_window AS (PARTITION BY Search_ID,Hotel_ID,Meal_Plan,Cancellation_Policy)
    )
    SELECT d.Supplier,
      countDistinct(d.Search_ID) searches_evaluated,
      countIf(e.Net_Rate_AED=e.cheapest_rate) cheapest_wins,
      round(100*countIf(e.Net_Rate_AED=e.cheapest_rate)/nullIf(countDistinct(d.Search_ID),0),2) win_rate,
      round(avg(if(e.eligible_count>1,(e.eligible_sum-e.Net_Rate_AED)/(e.eligible_count-1)-e.Net_Rate_AED,NULL)),2) average_price_advantage,
      round(avgIf(100,d.Available='Yes'),2) availability_coverage
    FROM dedup d
    LEFT JOIN eligible e ON e.Search_ID=d.Search_ID AND e.Hotel_ID=d.Hotel_ID
      AND e.Meal_Plan=d.Meal_Plan AND e.Cancellation_Policy=d.Cancellation_Policy AND e.Supplier=d.Supplier
    GROUP BY d.Supplier ORDER BY d.Supplier`,
    query_params: { hotelId, mealPlan, cancellationPolicy },
    format: 'JSONEachRow'
  });
  const rows = await result.json();
  const scored = scoreHistoricalSuppliers(rows);
  const best = scored.find(r => r.recommendationScore === Math.max(...scored.map(x => x.recommendationScore))) || null;
  const minSamples = Number(process.env.AUDIT_MIN_SAMPLES || 5);
  return best && best.sampleSize >= minSamples ? best : null;
}

module.exports = { getHistoricalRecommendation, scoreHistoricalSuppliers };
