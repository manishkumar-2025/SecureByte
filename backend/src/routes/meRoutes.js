const { requireAuth } = require('../middleware/auth');
const { getPreferences, updatePreferences } = require('../controllers/preferencesController');
const { validateBody } = require('../middleware/validate');

const router = require('express').Router();

router.use(requireAuth);

const objectRule = (value) =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? { value }
    : { error: 'Preferences must be an object of boolean flags.' };

router.get('/preferences', getPreferences);
router.put('/preferences', validateBody({ preferences: objectRule }), updatePreferences);

module.exports = router;
