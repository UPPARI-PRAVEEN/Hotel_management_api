-- Historical metrics do not use booking outcomes (not present in the supplied dataset).
-- Each offer group contributes at most one observation per supplier.
WITH offers AS (
  SELECT * EXCEPT (row_number)
  FROM (
    SELECT *, row_number() OVER (
      PARTITION BY Search_ID, Hotel_ID, Meal_Plan, Cancellation_Policy, Supplier
      ORDER BY Ingested_At DESC
    ) AS row_number
    FROM hotel_intelligence.raw_supplier_offers
  )
  WHERE row_number = 1
), eligible AS (
  SELECT *
  FROM offers
  WHERE Available = 'Yes'
    AND Supplier_Status = 'AVAILABLE'
    AND Net_Rate_AED IS NOT NULL
    AND Net_Rate_AED > 0
    AND Currency = 'AED'
), group_stats AS (
  SELECT Search_ID, Hotel_ID, Meal_Plan, Cancellation_Policy,
         count() AS eligible_count,
         min(Net_Rate_AED) AS cheapest_rate
  FROM eligible
  GROUP BY Search_ID, Hotel_ID, Meal_Plan, Cancellation_Policy
)
SELECT o.Hotel_ID, o.Meal_Plan, o.Cancellation_Policy, o.Supplier,
       countDistinct(o.Search_ID) AS searches_evaluated,
       countIf(e.Search_ID IS NOT NULL AND e.Net_Rate_AED = g.cheapest_rate) AS cheapest_wins,
       round(countIf(e.Search_ID IS NOT NULL AND e.Net_Rate_AED = g.cheapest_rate) /
             nullIf(countDistinct(o.Search_ID), 0) * 100, 2) AS win_rate,
       avg(if(e.Net_Rate_AED IS NULL, NULL,
              g.cheapest_rate - e.Net_Rate_AED)) AS avg_price_advantage_raw,
       round(avg(if(o.Available = 'Yes', 100.0, 0.0)), 2) AS availability_coverage
FROM offers o
LEFT JOIN eligible e ON e.Search_ID=o.Search_ID AND e.Hotel_ID=o.Hotel_ID
  AND e.Meal_Plan=o.Meal_Plan AND e.Cancellation_Policy=o.Cancellation_Policy
  AND e.Supplier=o.Supplier
LEFT JOIN group_stats g ON g.Search_ID=o.Search_ID AND g.Hotel_ID=o.Hotel_ID
  AND g.Meal_Plan=o.Meal_Plan AND g.Cancellation_Policy=o.Cancellation_Policy
WHERE o.Hotel_ID = {hotelId:String}
  AND o.Meal_Plan = {mealPlan:String}
  AND o.Cancellation_Policy = {cancellationPolicy:String}
GROUP BY o.Hotel_ID, o.Meal_Plan, o.Cancellation_Policy, o.Supplier
ORDER BY o.Supplier;
