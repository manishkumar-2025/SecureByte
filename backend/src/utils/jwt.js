const jwt = require('jsonwebtoken');
const { env } = require('../config/env');

/**
 * Signs a JWT for the given user. The token embeds the user id and role,
 * BUT the auth middleware always re-reads the role from the database, so a
 * stale or forged role claim in a token can never grant responder powers.
 */
function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
}

module.exports = { signToken };
