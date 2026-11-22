const express = require('express');
const { supplierRecommendation, bestHotelSearch } = require('../controllers/hotel.controller');

const router = express.Router();
router.get('/search', bestHotelSearch);
router.get('/:hotelId/supplier-recommendation', supplierRecommendation);

module.exports = router;
