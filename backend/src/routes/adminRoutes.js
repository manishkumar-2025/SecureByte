const { requireAuth, requireRole } = require('../middleware/auth');
const { listUsers } = require('../controllers/adminController');

const router = require('express').Router();

// ADMIN-only surface. There is deliberately NO public endpoint that
// grants the ADMIN role — accounts are promoted by seed or directly
// in the database by an operator.
router.use(requireAuth, requireRole('ADMIN'));

router.get('/users', listUsers);

module.exports = router;
