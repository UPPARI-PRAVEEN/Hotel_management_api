const express = require('express');
const { generateRecommendation } = require('../controllers/llm.controller');

const router = express.Router();
router.post('/generate', generateRecommendation);

module.exports = router;
