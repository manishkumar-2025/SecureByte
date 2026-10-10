const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const { prisma } = require('../lib/prisma');
const { unauthorized, forbidden } = require('../utils/errors');

/**
 * Verifies the Bearer token (signature + expiry) and loads a fresh user
 * record from the database. req.user.role therefore always reflects the
 * SERVER-side role — a client can never assert itself as a responder.
 */
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
      throw unauthorized('Authentication required. Please sign in.', 'TOKEN_MISSING');
    }

    const token = header.slice(7).trim();
    let payload;
    try {
      payload = jwt.verify(token, env.jwtSecret); // throws on bad signature / expiry
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw unauthorized('Your session has expired. Please sign in again.', 'TOKEN_EXPIRED');
      }
      throw unauthorized('Invalid authentication token.', 'TOKEN_INVALID');
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      throw unauthorized('This account no longer exists.', 'USER_NOT_FOUND');
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/** Role-based authorization. Usage: requireRole('RESPONDER'). */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(unauthorized('Authentication required.'));
    if (!roles.includes(req.user.role)) {
      return next(forbidden('You do not have permission to perform this action.', 'FORBIDDEN'));
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
