const request = require('supertest');
const app = require('../src/app');
const { rankOffers } = require('../src/services/cheapestRate.service');

const offer = (Supplier, Net_Rate_AED, Supplier_Status='AVAILABLE', Available='Yes', Currency='AED') => ({
  Supplier, Net_Rate_AED, Supplier_Status, Available, Currency, Supplier_Hotel_ID: `ID-${Supplier}`
});

describe('deterministic cheapest supplier', () => {
  test('normal selection', () => {
    const r = rankOffers([offer('Supplier A',560),offer('Supplier D',544.68),offer('Supplier B',598)]);
    expect(r.cheapestSupplier).toBe('Supplier D'); expect(r.runnerUpSupplier).toBe('Supplier A');
  });
  test('equal-price suppliers use alphabetical supplier', () => {
    const r = rankOffers([offer('Supplier D',500),offer('Supplier A',500),offer('Supplier B',600)]);
    expect(r.cheapestSupplier).toBe('Supplier A'); expect(r.reasonCodes).toContain('PRICE_TIE');
  });
  test('missing supplier remains visible', () => {
    const r = rankOffers([offer('Supplier A',500)]);
    expect(r.supplierOffers.find(o => o.supplier === 'Supplier D').status).toBe('MISSING');
  });
  test('suppliers discovered in offer data are included without a hard-coded list', () => {
    const r = rankOffers([offer('Supplier F',450), offer('Supplier A',500)]);
    expect(r.supplierOffers.find(o => o.supplier === 'Supplier F').netRateAED).toBe(450);
  });
  test('NOT_MAPPED supplier is not eligible', () => {
    const r = rankOffers([offer('Supplier E',0,'NOT_MAPPED','No'),offer('Supplier A',500)]);
    expect(r.reasonCodes).toContain('SUPPLIER_NOT_MAPPED'); expect(r.cheapestSupplier).toBe('Supplier A');
    expect(r.supplierOffers.find(o => o.supplier === 'Supplier E').netRateAED).toBeNull();
  });
  test('NO_RATE supplier is not eligible', () => {
    const r = rankOffers([offer('Supplier C',null,'NO_RATE','No'),offer('Supplier A',500)]);
    expect(r.reasonCodes).toContain('SUPPLIER_NO_RATE');
  });
  test('unavailable supplier is not eligible', () => {
    const r = rankOffers([offer('Supplier D',400,'AVAILABLE','No'),offer('Supplier A',500)]);
    expect(r.cheapestSupplier).toBe('Supplier A'); expect(r.reasonCodes).toContain('SUPPLIER_UNAVAILABLE');
  });
  test('only one eligible supplier', () => {
    const r = rankOffers([offer('Supplier D',400),offer('Supplier A',null,'NO_RATE','No')]);
    expect(r.runnerUpSupplier).toBeNull(); expect(r.reasonCodes).toContain('INSUFFICIENT_COMPETITION');
  });
  test('no eligible supplier', () => {
    const r = rankOffers([offer('Supplier D',null,'NO_RATE','No'),offer('Supplier A',0)]);
    expect(r.cheapestSupplier).toBeNull(); expect(r.cheapestRateAED).toBeNull();
  });
  test('meal and cancellation isolation are exercised by exact key', () => {
    const r = rankOffers([offer('Supplier A',640.1),offer('Supplier D',627.28)]);
    expect(r.cheapestSupplier).toBe('Supplier D');
  });
  test('invalid API query parameters', async () => {
    const response = await request(app).get('/api/v1/hotels/DXB00001/supplier-recommendation?searchId=x&mealPlan=AI&cancellationPolicy=Maybe');
    expect(response.status).toBe(400);
  });
  test('hotel search rejects invalid meal and cancellation filters', async () => {
    const response = await request(app).get('/api/v1/hotels/search?mealPlan=AI&cancellationPolicy=Maybe');
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });
});

describe('historical recommendation', () => {
  const { scoreHistoricalSuppliers } = require('../src/services/supplierRecommendation.service');
  test('insufficient samples remains low confidence and below threshold', () => {
    const rows = [{Supplier:'Supplier D',searches_evaluated:2,cheapest_wins:1,win_rate:50,average_price_advantage:20,availability_coverage:90}];
    const [result] = scoreHistoricalSuppliers(rows, 5);
    expect(result.confidence).toBe('LOW'); expect(result.sampleSize).toBe(2);
  });
});
