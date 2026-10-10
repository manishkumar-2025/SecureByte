// ─────────────────────────────────────────────────────────────
// SecureByte — In-app notification center controller
//
// Users see ONLY their own notifications. Supports ?unread=true,
// pagination, marking one or all as read, and an unread counter the
// mobile app polls for the bell badge.
// ─────────────────────────────────────────────────────────────
const { prisma } = require('../lib/prisma');
const { notFound, unprocessable } = require('../utils/errors');
const { NOTIFICATION_TYPES } = require('../utils/constants');
const { parsePagination } = require('../utils/pagination');

// GET /api/notifications?unread=true&type=&page=&limit=
async function listNotifications(req, res, next) {
  try {
    const { page, limit, skip, take } = parsePagination(req.query);
    const where = { userId: req.user.id };

    if (req.query.unread === 'true') where.readAt = null;
    if (req.query.type) {
      if (!NOTIFICATION_TYPES.includes(req.query.type)) {
        throw unprocessable(`Type must be one of: ${NOTIFICATION_TYPES.join(', ')}.`, 'VALIDATION_ERROR');
      }
      where.type = req.query.type;
    }

    const [items, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId: req.user.id, readAt: null } }),
    ]);

    res.status(200).json({
      success: true,
      data: { items, unreadCount, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } },
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/notifications/unread-count — cheap poll target for badges.
async function unreadCount(req, res, next) {
  try {
    const count = await prisma.notification.count({ where: { userId: req.user.id, readAt: null } });
    res.status(200).json({ success: true, data: { count } });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/notifications/:id/read — mark one as read (own row only).
async function markRead(req, res, next) {
  try {
    const existing = await prisma.notification.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.userId !== req.user.id) {
      throw notFound('Notification not found.', 'NOTIFICATION_NOT_FOUND');
    }
    const notification = await prisma.notification.update({
      where: { id: existing.id },
      data: { readAt: existing.readAt || new Date() },
    });
    res.status(200).json({ success: true, data: { notification } });
  } catch (err) {
    next(err);
  }
}

// POST /api/notifications/read-all — mark every own notification read.
async function markAllRead(req, res, next) {
  try {
    const result = await prisma.notification.updateMany({
      where: { userId: req.user.id, readAt: null },
      data: { readAt: new Date() },
    });
    res.status(200).json({ success: true, data: { updated: result.count } });
  } catch (err) {
    next(err);
  }
}

module.exports = { listNotifications, unreadCount, markRead, markAllRead };
