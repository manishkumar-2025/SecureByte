const { prisma } = require('../lib/prisma');
const { parsePagination } = require('../utils/pagination');
const { notifyUsers } = require('../lib/notify');

// GET /api/announcements — authenticated (students read, responders read).
async function listAnnouncements(req, res, next) {
  try {
    const { page, limit, skip, take } = parsePagination(req.query);

    const [items, total] = await Promise.all([
      prisma.announcement.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { author: { select: { id: true, name: true } } },
      }),
      prisma.announcement.count(),
    ]);

    res.status(200).json({ success: true, data: { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } } });
  } catch (err) {
    next(err);
  }
}

// POST /api/responder/announcements — RESPONDER only (route enforces role).
async function createAnnouncement(req, res, next) {
  try {
    const { title, message, severity } = req.validated;

    const announcement = await prisma.announcement.create({
      data: { authorId: req.user.id, title, message, severity },
      include: { author: { select: { id: true, name: true } } },
    });

    // Fan out to everyone except the author (responders warn the whole
    // campus — that is the point of a safety announcement). Every user
    // gets an in-app center row; push honours per-user prefs. The full
    // fan-out is asynchronous so the author gets an instant response.
    (async () => {
      const users = await prisma.user.findMany({
        where: { id: { not: req.user.id } },
        select: { id: true, notificationPrefs: true },
      });
      await notifyUsers(users, {
        type: 'ANNOUNCEMENT',
        title: `${severity === 'CRITICAL' ? '🚨' : severity === 'WARNING' ? '⚠️' : '📢'} Safety announcement`,
        body: announcement.title,
        incidentId: null,
        pushData: { announcementId: announcement.id, severity },
        prefKey: 'announcements',
      });
    })().catch((err) => console.error('[notify]', err.message));

    res.status(201).json({ success: true, data: { announcement } });
  } catch (err) {
    next(err);
  }
}

module.exports = { listAnnouncements, createAnnouncement };
