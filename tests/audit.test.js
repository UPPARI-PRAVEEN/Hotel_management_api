const fs = require('node:fs');
const { parse } = require('csv-parse/sync');
const { auditSupplierDataset } = require('../src/ingestion/audit.service');

test('audits the supplied dataset without assumptions', () => {
  const records = parse(fs.readFileSync('data/supplier_offers.csv'), { columns: true, bom: true, trim: true });
  const audit = auditSupplierDataset(records);
  expect(audit.datasetRowCount).toBe(100000);
  expect(audit.uniqueHotelCount).toBe(1000);
  expect(audit.uniqueSearchIdCount).toBe(5000);
  expect(audit.supplierCount).toBe(5);
  expect(audit.hotelsWithout100Records).toBe(0);
  expect(audit.duplicateSupplierOffers).toBe(0);
  expect(audit.missingRates).toBe(22995);
});
