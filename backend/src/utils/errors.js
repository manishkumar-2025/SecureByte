/**
 * Application error type with an HTTP status, a machine-readable code and
 * optional structured details. Middleware turns these into consistent JSON
 * responses, so controllers only need to throw.
 */
class AppError extends Error {
  constructor(statusCode, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
  }
}

const badRequest = (message, code = 'BAD_REQUEST', details) => new AppError(400, code, message, details);
const unauthorized = (message, code = 'UNAUTHORIZED', details) => new AppError(401, code, message, details);
const forbidden = (message, code = 'FORBIDDEN', details) => new AppError(403, code, message, details);
const notFound = (message = 'Resource not found.', code = 'NOT_FOUND', details) => new AppError(404, code, message, details);
const conflict = (message, code = 'CONFLICT', details) => new AppError(409, code, message, details);
const unprocessable = (message, code = 'VALIDATION_ERROR', details) => new AppError(422, code, message, details);
const tooMany = (message = 'Too many requests. Please slow down and try again later.', code = 'RATE_LIMITED', details) =>
  new AppError(429, code, message, details);
const locked = (message, code = 'ACCOUNT_LOCKED', details) => new AppError(423, code, message, details);

module.exports = { AppError, badRequest, unauthorized, forbidden, notFound, conflict, unprocessable, tooMany, locked };
