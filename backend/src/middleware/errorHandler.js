const { AppError } = require('../utils/errors');

/** 404 for unknown routes (everything that reached here unmatched). */
function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.originalUrl} does not exist.` },
  });
}

/**
 * Central error handler.
 * - AppError          → its status/code/message
 * - Prisma P2002      → 409 duplicate record
 * - Prisma P2025      → 404 record missing
 * - JSON parse errors → 400
 * - anything else     → 500 with a GENERIC message (stack traces are only
 *                        logged server-side, never sent to the client)
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let error = err;

  if (!(err instanceof AppError)) {
    if (err.code === 'P2002') {
      error = new AppError(409, 'DUPLICATE', 'A record with these details already exists.');
    } else if (err.code === 'P2025') {
      error = new AppError(404, 'NOT_FOUND', 'The requested record does not exist.');
    } else if (err.type === 'entity.parse.failed') {
      error = new AppError(400, 'INVALID_JSON', 'Request body is not valid JSON.');
    } else if (err.type === 'entity.too.large') {
      error = new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
    } else {
      error = new AppError(500, 'INTERNAL_ERROR', 'Something went wrong on our side. Please try again.');
    }
  }

  if (error.statusCode >= 500) {
    console.error('[error]', err); // full details live in server logs only
  }

  const body = {
    success: false,
    error: {
      code: error.code || 'INTERNAL_ERROR',
      message: error.message || 'Unexpected error.',
    },
  };
  if (error.details) body.error.details = error.details;

  res.status(error.statusCode || 500).json(body);
}

module.exports = { notFoundHandler, errorHandler };
