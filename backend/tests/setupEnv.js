// Jest setupFiles: runs BEFORE any test module is loaded, so every module
// that reads process.env at require-time sees the test configuration.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-key-with-at-least-32-chars!!';
process.env.BCRYPT_ROUNDS = '4';
process.env.TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/campusshield_test?schema=public';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

// Generous limits so functional tests don't trip rate limiting.
// (Rate limiter behaviour is verified separately via its config + the
// documented Postman checks.)
process.env.RATE_LIMIT_GLOBAL_MAX = '100000';
process.env.RATE_LIMIT_GLOBAL_WINDOW_MINUTES = '5';
process.env.RATE_LIMIT_LOGIN_MAX = '100000';
process.env.RATE_LIMIT_LOGIN_WINDOW_MINUTES = '15';
process.env.RATE_LIMIT_REGISTER_MAX = '100000';
process.env.RATE_LIMIT_REGISTER_WINDOW_MINUTES = '60';
process.env.RATE_LIMIT_INCIDENT_MAX = '100000';
process.env.RATE_LIMIT_INCIDENT_WINDOW_MINUTES = '10';

process.env.RESPONDER_SETUP_CODE = 'jest-setup-code-99';
process.env.DUPLICATE_WINDOW_SECONDS = '30';
