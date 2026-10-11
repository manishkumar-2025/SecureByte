const { validateBody, rules } = require('../middleware/validate');
const { loginLimiter, registerLimiter, refreshLimiter } = require('../middleware/rateLimiters');
const {
  register,
  login,
  refresh,
  logout,
  changePassword,
  me,
  setupResponder,
  sendOtpEndpoint,
  verifyOtpEndpoint,
  verificationStatusEndpoint,
} = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

const router = require('express').Router();

router.post(
  '/register',
  registerLimiter,
  validateBody({
    name: rules.string({ label: 'Name', min: 2, max: 80 }),
    email: rules.email(),
    password: rules.password(),
    phone: rules.phone({ required: false }),
  }),
  register
);

router.post(
  '/login',
  loginLimiter,
  validateBody({
    email: rules.email(),
    password: rules.string({ label: 'Password', min: 1, max: 128 }),
  }),
  login
);

// Dual Email & Mobile Verification endpoints
router.post(
  '/send-otp',
  requireAuth,
  validateBody({
    channel: rules.string({ label: 'Channel', min: 3, max: 10 }),
    target: rules.string({ label: 'Target', min: 3, max: 120, required: false }),
  }),
  sendOtpEndpoint
);

router.post(
  '/verify-otp',
  requireAuth,
  validateBody({
    channel: rules.string({ label: 'Channel', min: 3, max: 10 }),
    code: rules.string({ label: 'Verification code', min: 4, max: 10 }),
  }),
  verifyOtpEndpoint
);

router.get('/verification-status', requireAuth, verificationStatusEndpoint);

// Silent session renewal. The refresh token is the credential here, so the
// endpoint gets its own limiter instead of consuming the login budget.
router.post(
  '/refresh',
  refreshLimiter,
  validateBody({
    refreshToken: rules.string({ label: 'Refresh token', min: 32, max: 256 }),
  }),
  refresh
);

// Revokes the presented refresh token (idempotent).
router.post(
  '/logout',
  validateBody({
    refreshToken: rules.string({ label: 'Refresh token', min: 32, max: 256, required: false }),
  }),
  logout
);

// Change password (requires a valid access token).
router.patch(
  '/password',
  requireAuth,
  validateBody({
    currentPassword: rules.string({ label: 'Current password', min: 1, max: 128 }),
    newPassword: rules.password(),
  }),
  changePassword
);

router.get('/me', requireAuth, me);

// Controlled responder provisioning (requires shared setup code; disabled
// when RESPONDER_SETUP_CODE is unset).
router.post(
  '/setup-responder',
  registerLimiter,
  validateBody({
    name: rules.string({ label: 'Name', min: 2, max: 80 }),
    email: rules.email(),
    password: rules.password(),
  }),
  setupResponder
);

module.exports = router;
