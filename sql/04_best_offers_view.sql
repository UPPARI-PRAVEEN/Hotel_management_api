-- Derived, query-time view of the best eligible offer for each exact search group.
-- It intentionally reads the latest raw version per supplier; it does not merge
-- RO/BB, refundable/non-refundable, hotels, or Search_IDs.
DROP VIEW IF EXISTS hotel_intelligence.best_offers;

CREATE VIEW hotel_intelligence.best_offers AS
WITH deduplicated AS (
  SELECT * EXCEPT (row_number)
  FROM (
    SELECT *, row_number() OVER (
      PARTITION BY Search_ID, Hotel_ID, Meal_Plan, Cancellation_Policy, Supplier
      ORDER BY Ingested_At DESC
    ) AS row_number
    FROM hotel_intelligence.raw_supplier_offers
  )
  WHERE row_number = 1
), group_keys AS (
  SELECT Search_ID, Hotel_ID, Meal_Plan, Cancellation_Policy
  FROM deduplicated
  GROUP BY Search_ID, Hotel_ID, Meal_Plan, Cancellation_Policy
), ranked AS (
  SELECT Search_ID, Hotel_ID, Meal_Plan, Cancellation_Policy, Supplier, Net_Rate_AED,
         row_number() OVER (
           PARTITION BY Search_ID, Hotel_ID, Meal_Plan, Cancellation_Policy
           ORDER BY Net_Rate_AED ASC, Supplier ASC
         ) AS eligible_rank,
         min(Net_Rate_AED) OVER (
           PARTITION BY Search_ID, Hotel_ID, Meal_Plan, Cancellation_Policy
         ) AS cheapest_rate
  FROM deduplicated
  WHERE Available = 'Yes'
    AND Supplier_Status = 'AVAILABLE'
    AND Net_Rate_AED IS NOT NULL
    AND Net_Rate_AED > 0
    AND Currency = 'AED'
), summaries AS (
  SELECT Search_ID, Hotel_ID, Meal_Plan, Cancellation_Policy,
         anyIf(Supplier, eligible_rank = 1) AS cheapest_supplier,
         minIf(Net_Rate_AED, eligible_rank = 1) AS cheapest_rate_aed,
         anyIf(Supplier, eligible_rank = 2) AS runner_up_supplier,
         minIf(Net_Rate_AED, eligible_rank = 2) AS runner_up_rate_aed,
         countIf(Net_Rate_AED = cheapest_rate) AS cheapest_tie_count,
         count() AS eligible_supplier_count
  FROM ranked
  GROUP BY Search_ID, Hotel_ID, Meal_Plan, Cancellation_Policy
)
SELECT g.Search_ID, g.Hotel_ID, g.Meal_Plan, g.Cancellation_Policy,
       CAST('AED', 'String') AS Currency,
       if(ifNull(s.eligible_supplier_count, 0) > 0, s.cheapest_supplier,
          CAST(NULL, 'Nullable(String)')) AS cheapest_supplier,
       if(ifNull(s.eligible_supplier_count, 0) > 0, s.cheapest_rate_aed,
          CAST(NULL, 'Nullable(Decimal(12, 2))')) AS cheapest_rate_aed,
       if(s.eligible_supplier_count > 1, s.runner_up_supplier,
          CAST(NULL, 'Nullable(String)')) AS runner_up_supplier,
       if(s.eligible_supplier_count > 1, s.runner_up_rate_aed,
          CAST(NULL, 'Nullable(Decimal(12, 2))')) AS runner_up_rate_aed,
       if(s.eligible_supplier_count > 1,
          s.runner_up_rate_aed - s.cheapest_rate_aed,
          CAST(NULL, 'Nullable(Decimal(12, 2))')) AS saving_vs_runner_up_aed,
       if(s.eligible_supplier_count > 1 AND s.runner_up_rate_aed > 0,
          round(toFloat64(s.runner_up_rate_aed - s.cheapest_rate_aed) /
                toFloat64(s.runner_up_rate_aed) * 100, 2),
          CAST(NULL, 'Nullable(Float64)')) AS saving_vs_runner_up_pct,
       ifNull(s.cheapest_tie_count, 0) AS cheapest_tie_count,
       ifNull(s.eligible_supplier_count, 0) AS eligible_supplier_count
FROM group_keys AS g
LEFT JOIN summaries AS s USING (Search_ID, Hotel_ID, Meal_Plan, Cancellation_Policy);
