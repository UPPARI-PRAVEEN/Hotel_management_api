const { hotelRecommendationSchema, hotelSearchSchema } = require('../utils/validation');
const { getCheapestOffer, getBestHotelOffers } = require('../services/cheapestRate.service');
const { getHistoricalRecommendation } = require('../services/supplierRecommendation.service');
const recommendationCache = require('../services/recommendationCache.service');

async function supplierRecommendation(req, res, next) {
  const started = process.hrtime.bigint();
  const parsed = hotelRecommendationSchema.safeParse({
    hotelId: req.params.hotelId,
    searchId: req.query.searchId,
    mealPlan: req.query.mealPlan,
    cancellationPolicy: req.query.cancellationPolicy
  });
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid query parameters', code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
  }

  try {
    const { hotelId, searchId, mealPlan, cancellationPolicy } = parsed.data;
    const cacheKey = JSON.stringify([searchId, hotelId, mealPlan, cancellationPolicy]);
    const cached = recommendationCache.getFresh(cacheKey);
    if (cached) {
      const latencyMs = Number(process.hrtime.bigint() - started) / 1e6;
      return res.status(200).json({
        ...cached.value,
        cache: { status: 'hit', ageMs: cached.ageMs },
        latencyMs: Number(latencyMs.toFixed(2))
      });
    }

    const cheapest = await getCheapestOffer({ searchId, hotelId, mealPlan, cancellationPolicy });
    let historical = null;
    let historicalRecommendationStatus = 'AVAILABLE';
    try {
      historical = await getHistoricalRecommendation({ hotelId, mealPlan, cancellationPolicy });
      if (!historical) historicalRecommendationStatus = 'INSUFFICIENT_HISTORY';
    } catch (err) {
      console.warn('Historical recommendation unavailable:', err.message);
      historicalRecommendationStatus = 'UNAVAILABLE';
    }

    const latencyMs = Number(process.hrtime.bigint() - started) / 1e6;
    const response = {
      searchId,
      hotelId,
      mealPlan,
      cancellationPolicy,
      currency: 'AED',
      cheapestSupplier: cheapest.cheapestSupplier,
      cheapestRateAED: cheapest.cheapestRateAED,
      runnerUpSupplier: cheapest.runnerUpSupplier,
      runnerUpRateAED: cheapest.runnerUpRateAED,
      savingVsRunnerUpAED: cheapest.savingVsRunnerUpAED,
      savingVsRunnerUpPct: cheapest.savingVsRunnerUpPct,
      supplierOffers: cheapest.supplierOffers,
      reasonCodes: cheapest.reasonCodes,
      historicalRecommendation: historical,
      historicalRecommendationStatus,
      recommendationConfidence: historical ? historical.confidence : null,
      cache: { status: 'miss', ageMs: 0 },
      latencyMs: Number(latencyMs.toFixed(2))
    };
    recommendationCache.set(cacheKey, response);
    return res.status(200).json(response);
  } catch (err) {
    const { hotelId, searchId, mealPlan, cancellationPolicy } = parsed.data;
    const cacheKey = JSON.stringify([searchId, hotelId, mealPlan, cancellationPolicy]);
    const stale = recommendationCache.getStale(cacheKey);
    if (stale) {
      console.warn('ClickHouse recommendation query failed; serving explicitly marked stale cache:', err.message);
      const latencyMs = Number(process.hrtime.bigint() - started) / 1e6;
      return res.status(200).json({
        ...stale.value,
        cache: { status: 'stale-fallback', ageMs: stale.ageMs },
        latencyMs: Number(latencyMs.toFixed(2))
      });
    }
    console.error('Supplier recommendation query failed with no usable cache:', err);
    const unavailable = new Error('Supplier recommendation is temporarily unavailable');
    unavailable.status = 503;
    unavailable.code = 'RECOMMENDATION_UNAVAILABLE';
    next(unavailable);
  }
}

async function bestHotelSearch(req, res, next) {
  const parsed = hotelSearchSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid query parameters', code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
  }

  try {
    const { mealPlan, cancellationPolicy } = parsed.data;
    const result = await getBestHotelOffers({ mealPlan, cancellationPolicy });
    return res.json({ mealPlan, cancellationPolicy, currency: 'AED', ...result });
  } catch (err) {
    next(err);
  }
}

module.exports = { supplierRecommendation, bestHotelSearch };
