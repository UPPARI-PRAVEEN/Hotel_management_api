const clickhouse = require('../config/clickhouse');

const SUPPLIERS = ['Supplier A', 'Supplier B', 'Supplier C', 'Supplier D', 'Supplier E'];

function rankOffers(allOffers) {
  const eligible = allOffers.filter(o =>
    o.Available === 'Yes' && o.Supplier_Status === 'AVAILABLE' &&
    o.Net_Rate_AED != null && Number(o.Net_Rate_AED) > 0 && o.Currency === 'AED'
  ).sort((a, b) => Number(a.Net_Rate_AED) - Number(b.Net_Rate_AED) || a.Supplier.localeCompare(b.Supplier));

  const winner = eligible[0] || null;
  const runner = eligible[1] || null;
  const tieCount = winner ? eligible.filter(o => Number(o.Net_Rate_AED) === Number(winner.Net_Rate_AED)).length : 0;
  const saving = winner && runner ? Number((Number(runner.Net_Rate_AED) - Number(winner.Net_Rate_AED)).toFixed(2)) : null;
  const savingPct = saving != null && Number(runner.Net_Rate_AED) > 0
    ? Number((saving / Number(runner.Net_Rate_AED) * 100).toFixed(2)) : null;

  const bySupplier = new Map(allOffers.map(o => [o.Supplier, o]));
  const supplierOffers = SUPPLIERS.map(name => {
    const o = bySupplier.get(name);
    if (!o) return { supplier: name, status: 'MISSING', available: false, netRateAED: null, reasonCode: 'SUPPLIER_NOT_MAPPED' };
    const available = o.Available === 'Yes' && o.Supplier_Status === 'AVAILABLE';
    let reasonCode = null;
    if (o.Supplier_Status === 'NOT_MAPPED') reasonCode = 'SUPPLIER_NOT_MAPPED';
    else if (o.Supplier_Status === 'NO_RATE' || o.Net_Rate_AED == null) reasonCode = 'SUPPLIER_NO_RATE';
    else if (!available) reasonCode = 'SUPPLIER_UNAVAILABLE';
    return {
      supplier: o.Supplier,
      status: o.Supplier_Status,
      available,
      netRateAED: o.Net_Rate_AED == null ? null : Number(o.Net_Rate_AED),
      supplierHotelId: o.Supplier_Hotel_ID || null,
      reasonCode
    };
  });

  const reasonCodes = [];
  if (!winner) reasonCodes.push('NO_ELIGIBLE_RATE');
  else {
    reasonCodes.push('LOWEST_ELIGIBLE_RATE');
    if (tieCount > 1) reasonCodes.push('PRICE_TIE');
  }
  if (!runner) {
    if (winner) reasonCodes.push('INSUFFICIENT_COMPETITION');
  }
  for (const offer of supplierOffers) {
    if (offer.reasonCode && !reasonCodes.includes(offer.reasonCode)) reasonCodes.push(offer.reasonCode);
  }

  return {
    cheapestSupplier: winner ? winner.Supplier : null,
    cheapestRateAED: winner ? Number(winner.Net_Rate_AED) : null,
    runnerUpSupplier: runner ? runner.Supplier : null,
    runnerUpRateAED: runner ? Number(runner.Net_Rate_AED) : null,
    savingVsRunnerUpAED: saving,
    savingVsRunnerUpPct: savingPct,
    supplierOffers,
    reasonCodes
  };
}

async function getCheapestOffer({ searchId, hotelId, mealPlan, cancellationPolicy }) {
  const result = await clickhouse.query({
    query: `WITH deduplicated AS (
      SELECT * EXCEPT (row_number) FROM (
        SELECT *, row_number() OVER (PARTITION BY Search_ID,Hotel_ID,Meal_Plan,Cancellation_Policy,Supplier ORDER BY Ingested_At DESC) row_number
        FROM raw_supplier_offers
        WHERE Search_ID={searchId:String} AND Hotel_ID={hotelId:String}
          AND Meal_Plan={mealPlan:String} AND Cancellation_Policy={cancellationPolicy:String}
      ) WHERE row_number=1
    ) SELECT Supplier,Supplier_Status,Available,Net_Rate_AED,Currency,Supplier_Hotel_ID
    FROM deduplicated ORDER BY Supplier`,
    query_params: { searchId, hotelId, mealPlan, cancellationPolicy },
    format: 'JSONEachRow'
  });
  const rows = await result.json();
  return rankOffers(rows);
}

async function getBestHotelOffers({ mealPlan, cancellationPolicy }) {
  const result = await clickhouse.query({
    query: `WITH deduplicated AS (
      SELECT * EXCEPT (row_number) FROM (
        SELECT *, row_number() OVER (PARTITION BY Search_ID,Hotel_ID,Meal_Plan,Cancellation_Policy,Supplier ORDER BY Ingested_At DESC) row_number
        FROM raw_supplier_offers
        WHERE Meal_Plan={mealPlan:String} AND Cancellation_Policy={cancellationPolicy:String}
      ) WHERE row_number=1
    ), offers AS (
      SELECT Hotel_ID, any(Hotel_Name) AS Hotel_Name, any(City) AS City, Supplier,
        countIf(Available='Yes' AND Supplier_Status='AVAILABLE' AND Net_Rate_AED IS NOT NULL AND Net_Rate_AED>0 AND Currency='AED') AS Eligible_Count,
        minIf(Net_Rate_AED,Available='Yes' AND Supplier_Status='AVAILABLE' AND Net_Rate_AED IS NOT NULL AND Net_Rate_AED>0 AND Currency='AED') AS Best_Rate,
        argMax(Supplier_Status,Ingested_At) AS Latest_Status,
        argMax(Available,Ingested_At) AS Latest_Available,
        argMax(Currency,Ingested_At) AS Latest_Currency
      FROM deduplicated GROUP BY Hotel_ID,Supplier
    )
    SELECT Hotel_ID,Hotel_Name,City,Supplier,
      if(Eligible_Count>0,'AVAILABLE',Latest_Status) AS Supplier_Status,
      if(Eligible_Count>0,'Yes',Latest_Available) AS Available,
      if(Eligible_Count>0,Best_Rate,CAST(NULL,'Nullable(Decimal(12,2))')) AS Net_Rate_AED,
      if(Eligible_Count>0,'AED',Latest_Currency) AS Currency,
      CAST(NULL,'Nullable(String)') AS Supplier_Hotel_ID
    FROM offers ORDER BY Hotel_ID,Supplier`,
    query_params: { mealPlan, cancellationPolicy },
    format: 'JSONEachRow'
  });
  const rows = await result.json();
  const offersByHotel = new Map();

  for (const row of rows) {
    if (!offersByHotel.has(row.Hotel_ID)) {
      offersByHotel.set(row.Hotel_ID, {
        hotelId: row.Hotel_ID,
        hotelName: row.Hotel_Name,
        city: row.City,
        offers: []
      });
    }
    offersByHotel.get(row.Hotel_ID).offers.push(row);
  }

  const hotels = [...offersByHotel.values()]
    .map(hotel => {
      const rankedOffers = rankOffers(hotel.offers);
      return {
        hotelId: hotel.hotelId,
        hotelName: hotel.hotelName,
        city: hotel.city,
        ...rankedOffers
      };
    })
    .filter(hotel => hotel.cheapestRateAED != null)
    .sort((a, b) => a.cheapestRateAED - b.cheapestRateAED || a.hotelId.localeCompare(b.hotelId));

  return { totalHotels: hotels.length, hotels: hotels.slice(0, 10) };
}

module.exports = { rankOffers, getCheapestOffer, getBestHotelOffers, SUPPLIERS };
