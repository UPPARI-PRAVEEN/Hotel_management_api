-- Deterministic ranking for one exact offer group.
-- Finalize ReplacingMergeTree versions and use the same group in every step.
WITH deduplicated AS (
  SELECT * EXCEPT (row_number)
  FROM (
    SELECT *, row_number() OVER (
      PARTITION BY Search_ID, Hotel_ID, Meal_Plan, Cancellation_Policy, Supplier
      ORDER BY Ingested_At DESC
    ) AS row_number
    FROM hotel_intelligence.raw_supplier_offers
    WHERE Search_ID = {searchId:String}
      AND Hotel_ID = {hotelId:String}
      AND Meal_Plan = {mealPlan:String}
      AND Cancellation_Policy = {cancellationPolicy:String}
  )
  WHERE row_number = 1
), eligible AS (
  SELECT *,
         row_number() OVER (
           ORDER BY Net_Rate_AED ASC, Supplier ASC
         ) AS eligible_rank,
         count() OVER () AS eligible_count
  FROM deduplicated
  WHERE Available = 'Yes'
    AND Supplier_Status = 'AVAILABLE'
    AND Net_Rate_AED IS NOT NULL
    AND Net_Rate_AED > 0
    AND Currency = 'AED'
)
SELECT
  d.Supplier,
  d.Supplier_Status,
  d.Available,
  d.Net_Rate_AED,
  d.Currency,
  d.Supplier_Hotel_ID,
  d.Cancellation_Fee_AED,
  d.Free_Cancellation,
  if(e.eligible_rank = 1, 1, 0) AS is_cheapest,
  e.eligible_rank,
  e.eligible_count
FROM deduplicated d
LEFT JOIN eligible e USING (Supplier)
ORDER BY d.Supplier ASC;
