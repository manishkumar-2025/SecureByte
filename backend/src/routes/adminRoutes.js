const { requireAuth, requireRole, ADMIN_ROLES } = require('../middleware/auth');
const {
  listUsers,
  listVerifications,
  reviewVerification,
  updateUserRole,
  listAuditLogs,
} = require('../controllers/adminController');

const router = require('express').Router();

// ADMIN & SYSTEM_ADMIN surface.
router.use(requireAuth, requireRole(...(ADMIN_ROLES || ['ADMIN', 'SYSTEM_ADMIN'])));

router.get('/users', listUsers);
router.patch('/users/:id/role', updateUserRole);
router.get('/verifications', listVerifications);
router.post('/verifications/:id/review', reviewVerification);
router.get('/audit-logs', listAuditLogs);

module.exports = router;
