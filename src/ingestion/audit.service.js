function toCount(rows, key) {
  return rows.reduce((m, r) => { const v = r[key] || '(missing)'; m[v] = (m[v] || 0) + 1; return m; }, {});
}

function auditSupplierDataset(rows) {
  const hotelCounts = {};
  const hotelSearchCounts = {};
  const keyCounts = new Map();
  const groupSupplierCounts = new Map();

  let missingRates = 0;
  let invalidPrices = 0;
  let negativePrices = 0;
  let invalidCurrencies = 0;
  let inconsistentAvailability = 0;

  for (const row of rows) {
    hotelCounts[row.Hotel_ID] = (hotelCounts[row.Hotel_ID] || 0) + 1;
    const hotelSearchKey = `${row.Hotel_ID}|${row.Search_ID}`;
    hotelSearchCounts[hotelSearchKey] = (hotelSearchCounts[hotelSearchKey] || 0) + 1;

    const key = [row.Search_ID, row.Hotel_ID, row.Meal_Plan, row.Cancellation_Policy, row.Supplier].join('|');
    keyCounts.set(key, (keyCounts.get(key) || 0) + 1);

    const groupKey = [row.Search_ID, row.Hotel_ID, row.Meal_Plan, row.Cancellation_Policy].join('|');
    const suppliers = groupSupplierCounts.get(groupKey) || new Set();
    suppliers.add(row.Supplier);
    groupSupplierCounts.set(groupKey, suppliers);

    if (row.Net_Rate_AED === '' || row.Net_Rate_AED == null) missingRates++;
    else {
      const rate = Number(row.Net_Rate_AED);
      if (!Number.isFinite(rate)) invalidPrices++;
      else if (rate < 0) negativePrices++;
    }
    if (row.Currency && row.Currency !== 'AED') invalidCurrencies++;
    if ((row.Supplier_Status === 'AVAILABLE') !== (row.Available === 'Yes')) inconsistentAvailability++;
  }

  const duplicateSupplierOffers = [...keyCounts.values()].filter(n => n > 1).reduce((n, count) => n + count - 1, 0);
  const hotelRows = Object.values(hotelCounts);
  const incompleteSupplierSlots = [...groupSupplierCounts.values()].filter(s => s.size !== 5).length;

  return {
    datasetRowCount: rows.length,
    uniqueHotelCount: Object.keys(hotelCounts).length,
    uniqueSearchIdCount: new Set(rows.map(r => r.Search_ID).filter(Boolean)).size,
    supplierCount: Object.keys(toCount(rows, 'Supplier')).filter(k => k !== '(missing)').length,
    mealPlanValues: toCount(rows, 'Meal_Plan'),
    cancellationPolicyValues: toCount(rows, 'Cancellation_Policy'),
    expected100RecordsPerHotel: hotelRows.filter(n => n === 100).length,
    hotelsWithout100Records: hotelRows.filter(n => n !== 100).length,
    expectedSupplierSlotsPerOfferGroup: 5,
    incompleteSupplierSlots,
    duplicateSupplierOffers,
    missingRates,
    invalidPrices,
    negativePrices,
    invalidCurrencies,
    inconsistentAvailability,
    missingSupplierRecords: rows.filter(r => r.Supplier_Status === 'NOT_MAPPED').length,
    unavailableSupplierRecords: rows.filter(r => r.Supplier_Status !== 'AVAILABLE' || r.Available !== 'Yes').length,
    unexpectedMealPlans: [...new Set(rows.map(r => r.Meal_Plan).filter(v => v !== 'RO' && v !== 'BB'))],
    unexpectedCancellationPolicies: [...new Set(rows.map(r => r.Cancellation_Policy).filter(v => v !== 'Refundable' && v !== 'Non-Refundable'))]
  };
}

module.exports = { auditSupplierDataset };
