// ─────────────────────────────────────────────────────────────
// SecureByte — Safety check-in controller
//
// SAFE     → reassurance signal, visible in the user's own history.
// NEEDS_HELP → alerts every responder + admin through the in-app
//              notification center AND best-effort push.
// ─────────────────────────────────────────────────────────────
const { prisma } = require('../lib/prisma');
const { unprocessable } = require('../utils/errors');
const { parsePagination } = require('../utils/pagination');
const { notifyUsers, loadSafetyStaff } = require('../lib/notify');

// POST /api/checkins — { status: SAFE|NEEDS_HELP, note?, latitude?, longitude? }
async function createCheckIn(req, res, next) {
  try {
    const { status, note, latitude, longitude } = req.validated;

    // Basic sanity: coordinates must be a plausible pair if provided.
    let coords = null;
    if (latitude !== undefined && longitude !== undefined) {
      const lat = Number(latitude);
      const lng = Number(longitude);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
        throw unprocessable('Coordinates must be valid (latitude -90…90, longitude -180…180).', 'VALIDATION_ERROR');
      }
      coords = { latitude: lat, longitude: lng };
    }

    const checkIn = await prisma.checkIn.create({
      data: {
        userId: req.user.id,
        status,
        note: note || null,
        ...(coords || {}),
      },
    });

    // NEEDS_HELP is an emergency signal — alert safety staff.
    if (status === 'NEEDS_HELP') {
      const staff = await loadSafetyStaff();
      const where = note ? ` — "${note}"` : '';
      notifyUsers(staff, {
        type: 'CHECK_IN_ALERT',
        title: '🆘 Check-in: needs help',
        body: `${req.user.name} marked themselves as NEEDS HELP${where}.`,
        incidentId: null,
        pushTitle: '🆘 Check-in: needs help',
        pushData: { checkInId: checkIn.id, userId: req.user.id },
        prefKey: 'sosAlerts',
      }).catch((err) => console.error('[notify]', err.message));
    }

    res.status(201).json({ success: true, data: { checkIn } });
  } catch (err) {
    next(err);
  }
}

// GET /api/checkins/me — the caller's own history, newest first.
async function listMyCheckIns(req, res, next) {
  try {
    const { page, limit, skip, take } = parsePagination(req.query);
    const where = { userId: req.user.id };
    const [items, total] = await Promise.all([
      prisma.checkIn.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.checkIn.count({ where }),
    ]);
    res.status(200).json({
      success: true,
      data: { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } },
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/responder/checkins — staff view: latest check-in per user
// plus live SAFE/NEEDS_HELP counters. Responders monitor this during
// campus-wide events instead of scrolling raw history.
async function listStaffCheckIns(req, res, next) {
  try {
    const { page, limit, skip, take } = parsePagination(req.query);

    const [items, total, safeCount, helpCount] = await Promise.all([
      prisma.checkIn.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { user: { select: { id: true, name: true, role: true } } },
      }),
      prisma.checkIn.count(),
      prisma.checkIn.count({ where: { status: 'SAFE', createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } } }),
      prisma.checkIn.count({ where: { status: 'NEEDS_HELP', createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } } }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        items,
        summary: { last24hSafe: safeCount, last24hNeedsHelp: helpCount },
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { createCheckIn, listMyCheckIns, listStaffCheckIns };
