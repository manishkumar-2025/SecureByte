const authRoutes = require('./authRoutes');
const incidentRoutes = require('./incidentRoutes');
const responderRoutes = require('./responderRoutes');
const announcementRoutes = require('./announcementRoutes');
const deviceRoutes = require('./deviceRoutes');
const contactRoutes = require('./contactRoutes');
const checkInRoutes = require('./checkInRoutes');
const safetyPointRoutes = require('./safetyPointRoutes');
const notificationRoutes = require('./notificationRoutes');
const meRoutes = require('./meRoutes');
const adminRoutes = require('./adminRoutes');

const router = require('express').Router();

router.use('/auth', authRoutes);
router.use('/incidents', incidentRoutes);
router.use('/responder', responderRoutes);
router.use('/announcements', announcementRoutes);
router.use('/devices', deviceRoutes);
router.use('/contacts', contactRoutes);
router.use('/checkins', checkInRoutes);
router.use('/safety-points', safetyPointRoutes);
router.use('/notifications', notificationRoutes);
router.use('/me', meRoutes);
router.use('/admin', adminRoutes);

module.exports = router;
