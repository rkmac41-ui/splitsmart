const { AppError } = require('../utils/errors');

function errorHandler(err, req, res, next) {
  // Log error for debugging
  if (process.env.NODE_ENV !== 'production') {
    console.error(err);
  }

  // Handle known operational errors
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
    });
  }

  // Handle SQLite constraint violations
  if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(409).json({
      error: 'Resource already exists',
    });
  }

  if (err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
    return res.status(400).json({
      error: 'Referenced resource does not exist',
    });
  }

  // Handle Joi validation errors
  if (err.isJoi) {
    return res.status(400).json({
      error: err.details.map(d => d.message).join(', '),
    });
  }

  // Unknown errors
  return res.status(500).json({
    error: 'Internal server error',
  });
}

module.exports = errorHandler;
