const { validateBody, rules } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { deviceLimiter } = require('../middleware/rateLimiters');
const { registerPushToken, deletePushToken } = require('../controllers/deviceController');

const router = require('express').Router();

router.use(requireAuth);

router.post(
  '/push-token',
  deviceLimiter,
  validateBody({
    token: rules.string({ label: 'Push token', min: 10, max: 512 }),
    platform: rules.oneOf({ values: ['android', 'ios', 'web'], label: 'Platform' }),
  }),
  registerPushToken
);

router.delete(
  '/push-token',
  validateBody({
    token: rules.string({ label: 'Push token', min: 10, max: 512 }),
  }),
  deletePushToken
);

module.exports = router;
