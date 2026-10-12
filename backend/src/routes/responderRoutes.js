const { validateBody, rules } = require('../middleware/validate');
const { requireAuth, requireRole, STAFF_ROLES } = require('../middleware/auth');
const { listIncidents, updateIncidentStatus } = require('../controllers/responderController');
const { createAnnouncement } = require('../controllers/announcementController');
const { getAnalytics } = require('../controllers/adminController');
const { listStaffCheckIns } = require('../controllers/checkInController');
const { STATUSES, SEVERITIES } = require('../utils/constants');

const router = require('express').Router();

// Every route below requires a valid JWT AND a staff role (RESPONDER,
// ADMIN, SECURITY, WARDEN, FACULTY, STAFF, SENSITIVE_OFFICER, SYSTEM_ADMIN), verified
// against the database record. ADMIN intentionally inherits full oversight.
router.use(requireAuth, requireRole(...(STAFF_ROLES || ['RESPONDER', 'ADMIN'])));

router.get('/incidents', listIncidents);
router.get('/analytics', getAnalytics);
router.get('/checkins', listStaffCheckIns);

router.patch(
  '/incidents/:id/status',
  validateBody({
    newStatus: rules.optionalOneOf({ values: STATUSES, label: 'New status' }),
    status: rules.optionalOneOf({ values: STATUSES, label: 'Status' }),
    responderNotes: rules.string({ label: 'Responder notes', min: 1, max: 1000, required: false }),
  }),
  updateIncidentStatus
);

router.post(
  '/announcements',
  validateBody({
    title: rules.string({ label: 'Title', min: 5, max: 140 }),
    message: rules.string({ label: 'Message', min: 10, max: 2000 }),
    severity: rules.optionalOneOf({ values: SEVERITIES, label: 'Severity', fallback: 'INFO' }),
  }),
  createAnnouncement
);

module.exports = router;
