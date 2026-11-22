const { hotelRecommendationSchema, hotelSearchSchema } = require('../utils/validation');
const { getCheapestOffer, getBestHotelOffers } = require('../services/cheapestRate.service');
const { getHistoricalRecommendation } = require('../services/supplierRecommendation.service');

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
    const cheapest = await getCheapestOffer({ searchId, hotelId, mealPlan, cancellationPolicy });
    let historical = null;
    try {
      historical = await getHistoricalRecommendation({ hotelId, mealPlan, cancellationPolicy });
    } catch (err) {
      console.warn('Historical recommendation unavailable:', err.message);
    }

    const latencyMs = Number(process.hrtime.bigint() - started) / 1e6;
    return res.status(200).json({
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
      recommendationConfidence: historical ? historical.confidence : null,
      latencyMs: Number(latencyMs.toFixed(2))
    });
  } catch (err) {
    next(err);
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
