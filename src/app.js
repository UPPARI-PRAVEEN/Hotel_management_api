require('dotenv').config();
const express = require('express');
const path = require('node:path');
const hotelRoutes = require('./routes/hotel.routes');
const llmRoutes = require('./routes/llm.routes');
const errorHandler = require('./middleware/errorHandler');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/v1/hotels', hotelRoutes);
app.use('/api/v1/llm', llmRoutes);
app.use(errorHandler);

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => console.log(`Hotel Supplier Intelligence API listening on port ${port}`));
}

module.exports = app;
