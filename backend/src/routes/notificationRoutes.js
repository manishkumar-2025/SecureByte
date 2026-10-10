const { requireAuth } = require('../middleware/auth');
const {
  listNotifications,
  unreadCount,
  markRead,
  markAllRead,
} = require('../controllers/notificationController');

const router = require('express').Router();

router.use(requireAuth);

// Static segments must be declared before /:id/read.
router.get('/', listNotifications);
router.get('/unread-count', unreadCount);
router.post('/read-all', markAllRead);
router.patch('/:id/read', markRead);

module.exports = router;
