const { env } = require('../config/env');
const { prisma } = require('../lib/prisma');
const { badRequest, unprocessable, notFound, forbidden, conflict } = require('../utils/errors');
const { CLIENT_CATEGORIES, CLIENT_PRIORITIES } = require('../utils/constants');
const { parsePagination } = require('../utils/pagination');
const { notifyUsers, loadSafetyStaff } = require('../lib/notify');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const incidentInclude = {
  location: true,
  statusHistory: { orderBy: { createdAt: 'asc' }, include: { updater: { select: { id: true, name: true } } } },
};

/**
 * Validates + normalizes the incident payload.
 * Documented priority rule:
 *   - SOS alerts   → priority CRITICAL (server-forced), category SOS_ALERT
 *   - Other events → client may pick LOW / MEDIUM / HIGH (default MEDIUM);
 *                     CRITICAL is rejected for non-SOS reports.
 */
function normalizeIncidentPayload(validated) {
  const { isSos = false } = validated;

  if (isSos) {
    return {
      title: validated.title || 'Emergency SOS Alert',
      description: validated.description || 'Emergency SOS alert triggered from the SecureByte mobile app.',
      category: 'SOS_ALERT',
      priority: 'CRITICAL',
      isSos: true,
    };
  }

  if (validated.priority === 'CRITICAL') {
    throw unprocessable(
      'CRITICAL priority is reserved for Emergency SOS alerts. Choose LOW, MEDIUM or HIGH.',
      'INVALID_PRIORITY'
    );
  }

  if (!validated.category || !CLIENT_CATEGORIES.includes(validated.category)) {
    throw unprocessable('Category must be one of: ' + CLIENT_CATEGORIES.join(', ') + '.', 'INVALID_CATEGORY');
  }

  return {
    title: validated.title,
    description: validated.description,
    category: validated.category,
    priority: validated.priority || 'MEDIUM',
    isSos: false,
  };
}

// POST /api/incidents — authenticated (any role may report). Rate-limited.
async function createIncident(req, res, next) {
  try {
    const reporterId = req.user.id; // NEVER trust a reporterId from the client body
    const { location } = req.validated;

    if (!req.validated.isSos) {
      if (!req.validated.title || req.validated.title.length < 5 || req.validated.title.length > 120) {
        throw unprocessable('Title must be between 5 and 120 characters.', 'VALIDATION_ERROR', {
          title: 'Title must be between 5 and 120 characters.',
        });
      }
      if (!req.validated.description || req.validated.description.length < 10 || req.validated.description.length > 2000) {
        throw unprocessable('Description must be between 10 and 2000 characters.', 'VALIDATION_ERROR', {
          description: 'Description must be between 10 and 2000 characters.',
        });
      }
    } else if (req.validated.title && (req.validated.title.length < 5 || req.validated.title.length > 120)) {
      throw unprocessable('Title must be between 5 and 120 characters.', 'VALIDATION_ERROR', {
        title: 'Title must be between 5 and 120 characters.',
      });
    }

    const payload = normalizeIncidentPayload(req.validated);

    // Anti-duplicate guard: same user + same title/category/SOS flag within
    // a short window → 409. Protects against double-taps and retry storms.
    const since = new Date(Date.now() - env.duplicateWindowSeconds * 1000);
    const dupe = await prisma.incident.findFirst({
      where: { reporterId, title: payload.title, category: payload.category, isSos: payload.isSos, createdAt: { gte: since } },
      select: { id: true },
    });
    if (dupe) {
      throw conflict(
        'This alert was just submitted a moment ago. It is already being processed — no need to send it again.',
        'DUPLICATE_SUBMISSION',
        { existingIncidentId: dupe.id }
      );
    }

    const incident = await prisma.incident.create({
      data: {
        reporterId,
        title: payload.title,
        description: payload.description,
        category: payload.category,
        priority: payload.priority,
        isSos: payload.isSos,
        status: 'NEW',
        location: location ? { create: location } : undefined,
      },
      include: { location: true },
    });

    // Alert safety staff (in-app center rows + best-effort push).
    // Fire-and-forget: the reporter's HTTP response must never wait on
    // (or fail with) notification delivery.
    notifyNewIncident(incident).catch((err) => console.error('[notify]', err.message));

    res.status(201).json({ success: true, data: { incident } });
  } catch (err) {
    next(err);
  }
}

/** Notification helper — alerts all RESPONDER + ADMIN accounts. */
async function notifyNewIncident(incident) {
  const staff = await loadSafetyStaff();
  const where = incident.location && incident.location.campusLandmark;
  const isSos = incident.isSos;
  const title = isSos ? '🚨 Emergency SOS alert' : `New ${CATEGORY_LABELS[incident.category] || 'report'} needs attention`;
  const body = where ? `${incident.title} — ${where}` : incident.title;
  await notifyUsers(staff, {
    type: isSos ? 'SOS_ALERT' : 'NEW_INCIDENT',
    title,
    body,
    incidentId: incident.id,
    pushData: { incidentId: incident.id, priority: incident.priority },
    prefKey: 'sosAlerts',
  });
}

const CATEGORY_LABELS = {
  MEDICAL_EMERGENCY: 'medical emergency',
  FIRE_HAZARD: 'fire hazard',
  SECURITY_THREAT: 'security threat',
  HARASSMENT: 'harassment report',
  FACILITY_CONCERN: 'facility concern',
  OTHER: 'report',
  SOS_ALERT: 'Emergency SOS alert',
};

// GET /api/incidents/my — authenticated. Only the caller's own reports.
// Supports ?status= ?q= (search in title/description) + pagination.
async function listMyIncidents(req, res, next) {
  try {
    const { page, limit, skip, take } = parsePagination(req.query);

    const where = { reporterId: req.user.id };
    if (req.query.status) {
      if (!['NEW', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED'].includes(req.query.status)) {
        throw unprocessable('Invalid status filter.', 'VALIDATION_ERROR');
      }
      where.status = req.query.status;
    }
    if (typeof req.query.q === 'string' && req.query.q.trim() !== '') {
      const q = req.query.q.trim().slice(0, 100);
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.incident.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { location: true },
      }),
      prisma.incident.count({ where }),
    ]);

    res.status(200).json({ success: true, data: { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } } });
  } catch (err) {
    next(err);
  }
}

// GET /api/incidents/:id — authenticated. Students may view ONLY their own
// incidents; responders may view all.
async function getIncidentById(req, res, next) {
  try {
    const incident = await prisma.incident.findUnique({
      where: { id: req.params.id },
      include: { ...incidentInclude, reporter: { select: { id: true, name: true } } },
    });

    if (!incident) throw notFound('Incident not found.', 'INCIDENT_NOT_FOUND');

    if (!['RESPONDER', 'ADMIN'].includes(req.user.role) && incident.reporterId !== req.user.id) {
      throw forbidden('You can only view your own reports.', 'NOT_YOUR_INCIDENT');
    }

    res.status(200).json({ success: true, data: { incident } });
  } catch (err) {
    next(err);
  }
}

// ── Photo evidence upload ────────────────────────────────────
// POST /api/incidents/:id/photo — owner attaches/replaces a photo.
// The file arrives via multer (validated mime + 5 MB cap); we store
// it under uploads/<uuid>.<ext> and save the relative path on the
// incident. Replacing a photo removes the previous file.
const EXT_BY_MIME = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

async function uploadIncidentPhoto(req, res, next) {
  try {
    const incident = await prisma.incident.findUnique({ where: { id: req.params.id } });
    if (!incident) throw notFound('Incident not found.', 'INCIDENT_NOT_FOUND');
    if (incident.reporterId !== req.user.id) {
      throw forbidden('Only the reporter can attach a photo to this report.', 'NOT_YOUR_INCIDENT');
    }
    if (!req.file) {
      throw unprocessable('Attach a photo in the "photo" field.', 'VALIDATION_ERROR');
    }

    const ext = EXT_BY_MIME[req.file.mimetype] || '.jpg';
    const filename = `${crypto.randomUUID()}${ext}`;
    const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
    fs.mkdirSync(uploadsDir, { recursive: true });
    fs.writeFileSync(path.join(uploadsDir, filename), req.file.buffer);

    const previous = incident.photoPath;
    const updated = await prisma.incident.update({
      where: { id: incident.id },
      data: { photoPath: `/uploads/${filename}` },
    });

    // Best-effort cleanup of the replaced file (after DB commit).
    if (previous && previous.startsWith('/uploads/')) {
      const oldFile = path.join(uploadsDir, path.basename(previous));
      fs.promises.unlink(oldFile).catch(() => {});
    }

    res.status(200).json({ success: true, data: { incident: updated } });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/incidents/:id/photo — owner removes their photo.
async function deleteIncidentPhoto(req, res, next) {
  try {
    const incident = await prisma.incident.findUnique({ where: { id: req.params.id } });
    if (!incident) throw notFound('Incident not found.', 'INCIDENT_NOT_FOUND');
    if (incident.reporterId !== req.user.id) {
      throw forbidden('Only the reporter can remove this photo.', 'NOT_YOUR_INCIDENT');
    }
    if (!incident.photoPath) {
      throw unprocessable('This report has no photo attached.', 'NO_PHOTO');
    }

    if (incident.photoPath.startsWith('/uploads/')) {
      const file = path.join(__dirname, '..', '..', 'uploads', path.basename(incident.photoPath));
      fs.promises.unlink(file).catch(() => {});
    }
    const updated = await prisma.incident.update({
      where: { id: incident.id },
      data: { photoPath: null },
    });
    res.status(200).json({ success: true, data: { incident: updated } });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createIncident,
  listMyIncidents,
  getIncidentById,
  uploadIncidentPhoto,
  deleteIncidentPhoto,
};
