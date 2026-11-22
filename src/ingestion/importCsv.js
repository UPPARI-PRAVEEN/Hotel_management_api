require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('csv-parse');
const clickhouse = require('../config/clickhouse');
const { auditSupplierDataset } = require('./audit.service');

const REQUIRED_COLUMNS = [
  'Search_ID','Hotel_ID','Hotel_Name','City','Child_ID','Meal_Plan','Cancellation_Policy',
  'Supplier','Supplier_Hotel_ID','Supplier_Status','Available','Net_Rate_AED','Cancellation_Fee_AED',
  'Free_Cancellation','Cheapest_Supplier','Cheapest_Rate_AED','Is_Cheapest',
  'Price_Difference_From_Cheapest_AED','Comparison_Key','Currency'
];

function nullableDecimal(value) {
  if (value == null || String(value).trim() === '' || value === 'N/A') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function validateRow(row) {
  if (!row.Search_ID || !row.Hotel_ID || !row.Supplier) return 'missing identifier';
  if (!['RO', 'BB'].includes(row.Meal_Plan)) return 'unexpected meal plan';
  if (!['Refundable', 'Non-Refundable'].includes(row.Cancellation_Policy)) return 'unexpected cancellation policy';
  if (row.Net_Rate_AED !== '' && row.Net_Rate_AED != null) {
    const rate = Number(row.Net_Rate_AED);
    if (!Number.isFinite(rate) || rate < 0) return 'invalid net rate';
  }
  if (row.Currency && row.Currency !== 'AED') return 'invalid currency';
  return null;
}

async function importCsv(filePath, batchSize = Number(process.env.CSV_BATCH_SIZE || 1000), auditOnly = false) {
  const rows = [];
  const auditRows = [];
  let imported = 0, rejected = 0, duplicate = 0;
  const seen = new Set();

  const parser = fs.createReadStream(filePath).pipe(parse({ columns: true, bom: true, trim: true, relax_column_count: true }));
  for await (const row of parser) {
    const missingColumns = REQUIRED_COLUMNS.filter(c => !(c in row));
    if (missingColumns.length) throw new Error(`Missing CSV columns: ${missingColumns.join(', ')}`);

    const key = [row.Search_ID, row.Hotel_ID, row.Meal_Plan, row.Cancellation_Policy, row.Supplier].join('|');
    if (seen.has(key)) duplicate++;
    else seen.add(key);

    const reason = validateRow(row);
    if (reason) { rejected++; continue; }

    const dbRow = {
      Search_ID: row.Search_ID,
      Hotel_ID: row.Hotel_ID,
      Hotel_Name: row.Hotel_Name || '',
      City: row.City || '',
      Child_ID: row.Child_ID || '',
      Meal_Plan: row.Meal_Plan,
      Cancellation_Policy: row.Cancellation_Policy,
      Supplier: row.Supplier,
      Supplier_Hotel_ID: row.Supplier_Hotel_ID || null,
      Supplier_Status: row.Supplier_Status || '',
      Available: row.Available === 'Yes' ? 'Yes' : 'No',
      Net_Rate_AED: nullableDecimal(row.Net_Rate_AED),
      Cancellation_Fee_AED: nullableDecimal(row.Cancellation_Fee_AED),
      Free_Cancellation: row.Free_Cancellation || '',
      Cheapest_Supplier: row.Cheapest_Supplier || null,
      Cheapest_Rate_AED: nullableDecimal(row.Cheapest_Rate_AED),
      Is_Cheapest: row.Is_Cheapest || '',
      Price_Difference_From_Cheapest_AED: nullableDecimal(row.Price_Difference_From_Cheapest_AED),
      Comparison_Key: row.Comparison_Key || '',
      Currency: row.Currency || ''
    };

    if (!auditOnly) rows.push(dbRow);
    auditRows.push(row);

    if (!auditOnly && rows.length >= batchSize) {
      await clickhouse.insert({ table: 'raw_supplier_offers', values: rows, format: 'JSONEachRow' });
      imported += rows.length;
      rows.length = 0;
    }
  }

  if (!auditOnly && rows.length) {
    await clickhouse.insert({ table: 'raw_supplier_offers', values: rows, format: 'JSONEachRow' });
    imported += rows.length;
  }

  return { imported, rejected, duplicate, audit: auditSupplierDataset(auditRows) };
}

if (require.main === module) {
  const auditOnly = process.argv.includes('--audit-only');
  const filePath = path.resolve(process.env.DATASET_PATH || 'data/supplier_offers.csv');
  importCsv(filePath, undefined, auditOnly)
    .then(result => { console.log(JSON.stringify(result, null, 2)); })
    .catch(err => { console.error(err); process.exitCode = 1; });
}

module.exports = { importCsv, validateRow };
