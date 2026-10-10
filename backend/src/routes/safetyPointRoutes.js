const { requireAuth } = require('../middleware/auth');
const { listSafetyPoints } = require('../controllers/safetyPointController');

const router = require('express').Router();

// Campus safety resources are visible to any signed-in user.
// Filtering/geo-sorting happens in the controller from query params.
router.get('/', requireAuth, listSafetyPoints);

module.exports = router;
