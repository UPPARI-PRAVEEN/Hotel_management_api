process.env.RECOMMENDATION_CACHE_TTL_MS = '100';
process.env.RECOMMENDATION_CACHE_STALE_TTL_MS = '300000';

jest.mock('../src/services/cheapestRate.service', () => ({
  getCheapestOffer: jest.fn(),
  getBestHotelOffers: jest.fn()
}));
jest.mock('../src/services/supplierRecommendation.service', () => ({
  getHistoricalRecommendation: jest.fn()
}));

const request = require('supertest');
const app = require('../src/app');
const recommendationCache = require('../src/services/recommendationCache.service');
const { getCheapestOffer } = require('../src/services/cheapestRate.service');
const { getHistoricalRecommendation } = require('../src/services/supplierRecommendation.service');

const path = '/api/v1/hotels/DXB00001/supplier-recommendation?searchId=SRCH0000001&mealPlan=RO&cancellationPolicy=Refundable';

beforeEach(() => {
  recommendationCache.clear();
  getCheapestOffer.mockReset().mockResolvedValue({
    cheapestSupplier: 'Supplier A',
    cheapestRateAED: 100,
    runnerUpSupplier: null,
    runnerUpRateAED: null,
    savingVsRunnerUpAED: null,
    savingVsRunnerUpPct: null,
    supplierOffers: [],
    reasonCodes: ['LOWEST_ELIGIBLE_RATE']
  });
  getHistoricalRecommendation.mockReset().mockResolvedValue(null);
});

test('serves a fresh cached response and reports its cache status', async () => {
  const first = await request(app).get(path);
  const second = await request(app).get(path);

  expect(first.status).toBe(200);
  expect(first.body.cache.status).toBe('miss');
  expect(second.status).toBe(200);
  expect(second.body.cache.status).toBe('hit');
  expect(getCheapestOffer).toHaveBeenCalledTimes(1);
});

test('uses a stale cached response only as an explicitly marked outage fallback', async () => {
  await request(app).get(path);
  await new Promise(resolve => setTimeout(resolve, 120));
  getCheapestOffer.mockRejectedValue(new Error('ClickHouse unavailable'));
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});

  const response = await request(app).get(path);

  expect(response.status).toBe(200);
  expect(response.body.cheapestSupplier).toBe('Supplier A');
  expect(response.body.cache.status).toBe('stale-fallback');
  expect(response.body.cache.ageMs).toBeGreaterThan(0);
  expect(warning).toHaveBeenCalled();
  warning.mockRestore();
});

test('returns an explicit service error when ClickHouse fails and no cache exists', async () => {
  getCheapestOffer.mockRejectedValue(new Error('ClickHouse unavailable'));
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});

  const response = await request(app).get(path);

  expect(response.status).toBe(503);
  expect(response.body.code).toBe('RECOMMENDATION_UNAVAILABLE');
  error.mockRestore();
});

test('reports unavailable historical scoring instead of silently implying a result', async () => {
  getHistoricalRecommendation.mockRejectedValue(new Error('ClickHouse unavailable'));
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});

  const response = await request(app).get(path);

  expect(response.status).toBe(200);
  expect(response.body.historicalRecommendation).toBeNull();
  expect(response.body.historicalRecommendationStatus).toBe('UNAVAILABLE');
  warning.mockRestore();
});
