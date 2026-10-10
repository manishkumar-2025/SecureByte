const { validateBody, rules } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { CHECK_IN_STATUSES } = require('../utils/constants');
const { createCheckIn, listMyCheckIns } = require('../controllers/checkInController');

const router = require('express').Router();

router.use(requireAuth);

// Optional-number rule used for the coordinates pair.
const optionalNumber = (label) => (value) => {
  if (value === undefined || value === null || value === '') return { value: undefined };
  const n = Number(value);
  if (!Number.isFinite(n)) return { error: `${label} must be a number.` };
  return { value: n };
};

router.post(
  '/',
  validateBody({
    status: rules.oneOf({ values: CHECK_IN_STATUSES, label: 'Check-in status' }),
    note: rules.string({ label: 'Note', min: 1, max: 500, required: false }),
    latitude: optionalNumber('Latitude'),
    longitude: optionalNumber('Longitude'),
  }),
  createCheckIn
);

// NOTE: /me must be declared before any future /:id-style route.
router.get('/me', listMyCheckIns);

module.exports = router;
