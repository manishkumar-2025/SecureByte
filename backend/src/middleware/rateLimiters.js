const rateLimit = require('express-rate-limit');
const { env } = require('../config/env');

const jsonHandler = (message) => (req, res) => {
  res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message } });
};

/** Broad safety net for every route. */
const globalLimiter = rateLimit({
  windowMs: env.rateLimits.globalWindowMs,
  max: env.rateLimits.globalMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler('Too many requests from this device. Please try again later.'),
});

/** Brute-force protection for the login endpoint. */
const loginLimiter = rateLimit({
  windowMs: env.rateLimits.loginWindowMs,
  max: env.rateLimits.loginMax,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: jsonHandler('Too many sign-in attempts. Please wait a few minutes and try again.'),
});

/** Token refresh: modest cap so stolen tokens cannot be hammered. */
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler('Too many session refresh attempts. Please sign in again.'),
});

/** Prevents mass account creation. */
const registerLimiter = rateLimit({
  windowMs: env.rateLimits.registerWindowMs,
  max: env.rateLimits.registerMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler('Too many registration attempts. Please try again later.'),
});

/**
 * Anti-spam for emergency submissions. Keyed by authenticated user id AND
 * IP, so one abusive account cannot block others behind the same IP, and
 * one IP cannot spam via many accounts.
 */
const incidentLimiter = rateLimit({
  windowMs: env.rateLimits.incidentWindowMs,
  max: env.rateLimits.incidentMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.user ? req.user.id : 'anon'}:${req.ip}`,
  handler: jsonHandler('You have submitted several alerts in a short time. Please wait a few minutes.'),
});

module.exports = { globalLimiter, loginLimiter, refreshLimiter, registerLimiter, incidentLimiter };
