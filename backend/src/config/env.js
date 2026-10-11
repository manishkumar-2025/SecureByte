// Loads and validates environment variables. The server fails fast
// with a clear message when a required variable is missing or invalid,
// instead of crashing later with a confusing error.
require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`\n[config] Missing required environment variable: ${name}`);
    console.error('[config] Fix: copy backend/.env.example to backend/.env and fill in the values.\n');
    process.exit(1);
  }
  return value;
}

function positiveInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n <= 0) {
    console.error(`\n[config] Environment variable ${name} must be a positive integer (got "${raw}").\n`);
    process.exit(1);
  }
  return n;
}

const jwtSecret = required('JWT_SECRET');
if (jwtSecret.length < 32) {
  console.error('\n[config] JWT_SECRET must be at least 32 characters long.');
  console.error('[config] Generate one with:\n  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"\n');
  process.exit(1);
}

// Production safety validations
if (process.env.NODE_ENV === 'production') {
  const isDefaultSecret = jwtSecret.includes('replace_with_a_random_secret') ||
    jwtSecret.includes('campusshield-2026!');
  if (isDefaultSecret) {
    console.error('\n[SECURITY ERROR] Default demo JWT_SECRET detected in production!');
    console.error('[SECURITY ERROR] Generate a fresh unique 48-byte secret before running in production.\n');
    process.exit(1);
  }

  if (process.env.CORS_ORIGIN === '*' || !process.env.CORS_ORIGIN) {
    console.warn('\n[SECURITY WARNING] Wildcard CORS ("*") is enabled in production.');
    console.warn('[SECURITY WARNING] Restrict CORS_ORIGIN to your authorized campus domain(s).\n');
  }

  if (process.env.RESPONDER_SETUP_CODE === 'SECURE_RESPONDER_2026_CODE') {
    console.warn('\n[SECURITY WARNING] The demo RESPONDER_SETUP_CODE is active in production!');
    console.warn('[SECURITY WARNING] Leave RESPONDER_SETUP_CODE empty to disable the setup endpoint in production.\n');
  }

  const hasTwilio = Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_PHONE_NUMBER
  );
  if (!hasTwilio) {
    console.warn('\n[TELEPHONY WARNING] Twilio credentials are not configured in production mode.');
    console.warn('[TELEPHONY WARNING] Outbound SMS alerts will record observable failures in dispatch logs rather than reporting fake delivery.\n');
  }

  const hasEmail = Boolean(process.env.SMTP_HOST || process.env.SENDGRID_API_KEY);
  if (!hasEmail) {
    console.warn('\n[EMAIL WARNING] Email provider credentials are not configured in production mode.');
    console.warn('[EMAIL WARNING] Outbound email dispatches will fail observably.\n');
  }
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
  port: positiveInt('PORT', 4000),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  bcryptRounds: positiveInt('BCRYPT_ROUNDS', 10),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  responderSetupCode: process.env.RESPONDER_SETUP_CODE || '',
  rateLimits: {
    globalMax: positiveInt('RATE_LIMIT_GLOBAL_MAX', 300),
    globalWindowMs: positiveInt('RATE_LIMIT_GLOBAL_WINDOW_MINUTES', 5) * 60 * 1000,
    loginMax: positiveInt('RATE_LIMIT_LOGIN_MAX', 10),
    loginWindowMs: positiveInt('RATE_LIMIT_LOGIN_WINDOW_MINUTES', 15) * 60 * 1000,
    registerMax: positiveInt('RATE_LIMIT_REGISTER_MAX', 5),
    registerWindowMs: positiveInt('RATE_LIMIT_REGISTER_WINDOW_MINUTES', 60) * 60 * 1000,
    incidentMax: positiveInt('RATE_LIMIT_INCIDENT_MAX', 6),
    incidentWindowMs: positiveInt('RATE_LIMIT_INCIDENT_WINDOW_MINUTES', 10) * 60 * 1000,
  },
  duplicateWindowSeconds: positiveInt('DUPLICATE_WINDOW_SECONDS', 30),
  // Account lockout: after N failed logins the account is locked for a window.
  loginMaxFailed: positiveInt('LOGIN_MAX_FAILED', 5),
  lockoutMinutes: positiveInt('LOCKOUT_MINUTES', 15),
  // Refresh-token lifetime (days). Access tokens stay short-lived.
  refreshTokenDays: positiveInt('REFRESH_TOKEN_DAYS', 30),
  // Set PUSH_DISABLED=true to turn off outbound push (e.g. CI).
  pushDisabled: String(process.env.PUSH_DISABLED || '').toLowerCase() === 'true',
  // Dual Email and Mobile verification
  requireVerification: process.env.REQUIRE_VERIFICATION === 'true',
  otpExpiryMinutes: positiveInt('OTP_EXPIRY_MINUTES', 10),
  otpCooldownSeconds: positiveInt('OTP_COOLDOWN_SECONDS', 60),
  otpMaxAttempts: positiveInt('OTP_MAX_ATTEMPTS', 5),
  // 60-second automatic escalation
  escalationDelaySeconds: positiveInt('ESCALATION_DELAY_SECONDS', 60),
  // Telephony credentials (optional)
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
  twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
  hasSmsProvider: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER),
  hasEmailProvider: Boolean(process.env.SMTP_HOST || process.env.SENDGRID_API_KEY),
};

module.exports = { env };
