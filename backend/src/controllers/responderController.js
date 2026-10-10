const { prisma } = require('../lib/prisma');
const { unprocessable, notFound, conflict } = require('../utils/errors');
const { ALL_CATEGORIES, PRIORITIES, STATUSES, STATUS_TRANSITIONS } = require('../utils/constants');
const { parsePagination } = require('../utils/pagination');
const { notifyUsers, loadUser } = require('../lib/notify');

// GET /api/responder/incidents — RESPONDER only. Full incident queue with
// filters, free-text search (?q=) and a documented sort order: SOS alerts
// first, then newest. Paginated with ?page= & ?limit=.
async function listIncidents(req, res, next) {
  try {
    const { page, limit, skip, take } = parsePagination(req.query);

    const where = {};
    if (req.query.status) {
      if (!STATUSES.includes(req.query.status)) throw unprocessable('Invalid status filter.');
      where.status = req.query.status;
    }
    if (req.query.category) {
      if (!ALL_CATEGORIES.includes(req.query.category)) throw unprocessable('Invalid category filter.');
      where.category = req.query.category;
    }
    if (req.query.priority) {
      if (!PRIORITIES.includes(req.query.priority)) throw unprocessable('Invalid priority filter.');
      where.priority = req.query.priority;
    }
    if (req.query.isSos === 'true' || req.query.isSos === 'false') {
      where.isSos = req.query.isSos === 'true';
    }
    if (typeof req.query.q === 'string' && req.query.q.trim() !== '') {
      const q = req.query.q.trim().slice(0, 100);
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { location: { is: { campusLandmark: { contains: q, mode: 'insensitive' } } } },
        { location: { is: { buildingOrRoom: { contains: q, mode: 'insensitive' } } } },
        { reporter: { is: { name: { contains: q, mode: 'insensitive' } } } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.incident.findMany({
        where,
        orderBy: [{ isSos: 'desc' }, { createdAt: 'desc' }],
        skip,
        take,
        include: { location: true, reporter: { select: { id: true, name: true } } },
      }),
      prisma.incident.count({ where }),
    ]);

    res.status(200).json({ success: true, data: { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } } });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/responder/incidents/:id/status — RESPONDER only.
 *
 * Runs inside a single database TRANSACTION: the incident status update and
 * the audit-history entry are written together, or not at all. Invalid
 * lifecycle transitions are rejected (New → Acknowledged → In Progress →
 * Resolved; skipping steps is not allowed).
 */
async function updateIncidentStatus(req, res, next) {
  try {
    const { newStatus, responderNotes } = req.validated;
    const incidentId = req.params.id;

    const incident = await prisma.incident.findUnique({ where: { id: incidentId } });
    if (!incident) throw notFound('Incident not found.', 'INCIDENT_NOT_FOUND');

    const allowed = STATUS_TRANSITIONS[incident.status];
    if (!allowed.includes(newStatus)) {
      throw conflict(
        allowed.length > 0
          ? `Invalid status change: ${incident.status} → ${newStatus}. The allowed next status is: ${allowed.join(', ')}.`
          : `Incident is already RESOLVED — its status can no longer change.`,
        'INVALID_STATUS_TRANSITION',
        { currentStatus: incident.status, allowedNextStatuses: allowed }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.incident.update({
        where: { id: incidentId },
        data: { status: newStatus },
      });
      await tx.incidentStatusHistory.create({
        data: {
          incidentId,
          updatedBy: req.user.id,
          previousStatus: incident.status,
          newStatus,
          responderNotes: responderNotes || null,
        },
      });
      return row;
    });

    const full = await prisma.incident.findUnique({
      where: { id: updated.id },
      include: {
        location: true,
        statusHistory: { orderBy: { createdAt: 'asc' }, include: { updater: { select: { id: true, name: true } } } },
        reporter: { select: { id: true, name: true } },
      },
    });

    // Notify the reporter: their report just moved forward. A Notification
    // row is always written (in-app center); push honours their prefs.
    // Fire-and-forget so the responder's action never waits on delivery.
    (async () => {
      const reporter = await loadUser(full.reporterId);
      if (!reporter) return;
      await notifyUsers([reporter], {
        type: 'STATUS_UPDATE',
        title: STATUS_PUSH_TITLES[newStatus],
        body: `"${full.title}" is now ${newStatus.replace('_', ' ').toLowerCase()}.`,
        incidentId: full.id,
        pushData: { incidentId: full.id, status: newStatus },
        prefKey: 'statusUpdates',
      });
    })().catch((err) => console.error('[notify]', err.message));

    res.status(200).json({ success: true, data: { incident: full } });
  } catch (err) {
    next(err);
  }
}

const STATUS_PUSH_TITLES = {
  ACKNOWLEDGED: '👀 Your report was seen',
  IN_PROGRESS: '🛠 Help is on the way',
  RESOLVED: '✅ Your report is resolved',
  NEW: 'Report received',
};

module.exports = { listIncidents, updateIncidentStatus };
