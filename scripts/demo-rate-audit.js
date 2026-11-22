const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('csv-parse/sync');
const { rankOffers } = require('../src/services/cheapestRate.service');

const filePath = path.resolve(process.env.DATASET_PATH || 'data/supplier_offers.csv');
const rows = parse(fs.readFileSync(filePath), { columns: true, bom: true, trim: true });
const groups = new Map();

for (const row of rows) {
  const key = JSON.stringify([row.Search_ID, row.Hotel_ID, row.Meal_Plan, row.Cancellation_Policy]);
  if (!groups.has(key)) groups.set(key, { key: JSON.parse(key), offers: [] });
  groups.get(key).offers.push(row);
}

const offersFor = group => rankOffers(group.offers);
const eligibleCount = group => offersFor(group).supplierOffers.filter(offer =>
  offer.available && offer.netRateAED != null && offer.netRateAED > 0
).length;
const validGroup = [...groups.values()].find(group => eligibleCount(group) >= 2);
const supplierDMissingGroup = [...groups.values()].find(group => {
  const supplierD = group.offers.find(offer => offer.Supplier === 'Supplier D');
  return supplierD &&
    ['NO_RATE', 'NOT_MAPPED'].includes(supplierD.Supplier_Status) &&
    offersFor(group).cheapestSupplier;
});

if (!validGroup) throw new Error('Sample has no group with two eligible supplier offers.');
if (!supplierDMissingGroup) throw new Error('Sample has no Supplier D NO_RATE/NOT_MAPPED demonstration group.');

const tieResult = rankOffers([
  { Supplier: 'Supplier A', Supplier_Status: 'AVAILABLE', Available: 'Yes', Net_Rate_AED: 500, Currency: 'AED' },
  { Supplier: 'Supplier B', Supplier_Status: 'AVAILABLE', Available: 'Yes', Net_Rate_AED: 500, Currency: 'AED' }
]);

console.log(JSON.stringify({
  dataset: path.relative(process.cwd(), filePath),
  sourceRows: rows.length,
  demonstrations: [
    {
      scenario: 'valid sample comparison',
      searchId: validGroup.key[0],
      hotelId: validGroup.key[1],
      mealPlan: validGroup.key[2],
      cancellationPolicy: validGroup.key[3],
      result: offersFor(validGroup)
    },
    {
      scenario: 'Supplier D missing rate or mapping',
      searchId: supplierDMissingGroup.key[0],
      hotelId: supplierDMissingGroup.key[1],
      mealPlan: supplierDMissingGroup.key[2],
      cancellationPolicy: supplierDMissingGroup.key[3],
      supplierD: offersFor(supplierDMissingGroup).supplierOffers.find(offer => offer.supplier === 'Supplier D'),
      cheapestSupplier: offersFor(supplierDMissingGroup).cheapestSupplier
    },
    {
      scenario: 'deterministic equal-price tie',
      result: tieResult
    }
  ]
}, null, 2));
