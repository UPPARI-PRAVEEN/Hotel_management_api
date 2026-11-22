const { z } = require('zod');

const hotelRecommendationSchema = z.object({
  hotelId: z.string().min(1).max(100),
  searchId: z.string().min(1).max(100),
  mealPlan: z.enum(['RO', 'BB']),
  cancellationPolicy: z.enum(['Refundable', 'Non-Refundable'])
});

const hotelSearchSchema = z.object({
  mealPlan: z.enum(['RO', 'BB']),
  cancellationPolicy: z.enum(['Refundable', 'Non-Refundable'])
});

module.exports = { hotelRecommendationSchema, hotelSearchSchema };
