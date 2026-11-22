function errorHandler(err, req, res, next) {
  if (err.status) return res.status(err.status).json({ error: err.message, code: err.code || 'REQUEST_ERROR' });
  console.error(err);
  return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
}

module.exports = errorHandler;
