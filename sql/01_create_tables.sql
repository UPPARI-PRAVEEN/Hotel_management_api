CREATE DATABASE IF NOT EXISTS hotel_intelligence;

CREATE TABLE IF NOT EXISTS hotel_intelligence.raw_supplier_offers
(
  Search_ID String,
  Hotel_ID String,
  Hotel_Name String,
  City String,
  Child_ID String,
  Meal_Plan String,
  Cancellation_Policy String,
  Supplier String,
  Supplier_Hotel_ID Nullable(String),
  Supplier_Status LowCardinality(String),
  Available LowCardinality(String),
  Net_Rate_AED Nullable(Decimal(12, 2)),
  Cancellation_Fee_AED Nullable(Decimal(12, 2)),
  Free_Cancellation LowCardinality(String),
  Cheapest_Supplier Nullable(String),
  Cheapest_Rate_AED Nullable(Decimal(12, 2)),
  Is_Cheapest LowCardinality(String),
  Price_Difference_From_Cheapest_AED Nullable(Decimal(12, 2)),
  Comparison_Key String,
  Currency LowCardinality(String),
  Ingested_At DateTime64(3, 'UTC') DEFAULT now64(3, 'UTC')
)
ENGINE = ReplacingMergeTree(Ingested_At)
PARTITION BY toYYYYMM(Ingested_At)
ORDER BY (Search_ID, Hotel_ID, Meal_Plan, Cancellation_Policy, Supplier)
SETTINGS index_granularity = 8192;
