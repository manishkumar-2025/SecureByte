const { env } = require('../config/env');
const { prisma } = require('../lib/prisma');
const { badRequest, unprocessable, notFound, forbidden, conflict } = require('../utils/errors');
const { CLIENT_CATEGORIES, CLIENT_PRIORITIES } = require('../utils/constants');
const { parsePagination } = require('../utils/pagination');
const { notifyUsers, loadSafetyStaff } = require('../lib/notify');
const { dispatchSosIncident } = require('../services/dispatchService');
const { scheduleEscalation } = require('../services/escalationService');
const { evaluateIncidentLocation } = require('../utils/geo');
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

    const isSos = Boolean(req.validated && req.validated.isSos);
    const isUnverifiedStudent = req.user.role === 'STUDENT' && req.user.isVerified === false;

    // Normal incident reports require verified accounts to prevent spam and abuse
    if (isUnverifiedStudent && !isSos) {
      throw forbidden(
        'Account verification required. Please verify your email and phone number to submit incident reports.',
        'UNVERIFIED_ACCOUNT'
      );
    }

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

    // Life-safety Emergency Fallback:
    // If an unverified student triggers an SOS, do NOT silently drop it.
    // Flag it prominently as unverified for authorized staff triage while keeping anti-abuse logs.
    if (isSos && isUnverifiedStudent) {
      if (!payload.title.startsWith('[UNVERIFIED SENDER]')) {
        payload.title = `[UNVERIFIED SENDER] ${payload.title}`;
      }
      payload.description = `[UNVERIFIED ACCOUNT EMERGENCY FALLBACK - URGENT STAFF TRIAGE REQUIRED] ${payload.description}`;
    }

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

    const isSensitive = Boolean(req.validated && req.validated.isSensitive);
    const accusedPerson = req.validated && req.validated.accusedPerson ? req.validated.accusedPerson.trim() : null;
    const accusedDepartment = req.validated && req.validated.accusedDepartment ? req.validated.accusedDepartment.trim() : null;
    const sensitiveCategory = req.validated && req.validated.sensitiveCategory ? req.validated.sensitiveCategory.trim() : null;
    const confidentialityNoticeAcknowledged = Boolean(req.validated && req.validated.confidentialityNoticeAcknowledged);

    // If marked sensitive, or involves specific accused person/department, route via independent escalation
    const independentReviewerOnly = isSensitive || Boolean(accusedPerson || accusedDepartment);
    const escalationPath = req.validated && req.validated.escalationPath
      ? req.validated.escalationPath
      : independentReviewerOnly
      ? 'INDEPENDENT_REVIEW'
      : 'STANDARD';

    const evaluatedLocation = location ? evaluateIncidentLocation(location) : undefined;

    const incident = await prisma.incident.create({
      data: {
        reporterId,
        title: payload.title,
        description: payload.description,
        category: payload.category,
        priority: payload.priority,
        isSos: payload.isSos,
        status: 'NEW',
        isSensitive,
        accusedPerson,
        accusedDepartment,
        sensitiveCategory,
        confidentialityNoticeAcknowledged,
        independentReviewerOnly,
        escalationPath,
        location: evaluatedLocation ? { create: evaluatedLocation } : undefined,
      },
      include: { location: true },
    });

    // Audit trail for unverified emergency fallback
    if (incident.isSos && isUnverifiedStudent) {
      await prisma.incidentStatusHistory.create({
        data: {
          incidentId: incident.id,
          updatedBy: reporterId,
          previousStatus: 'NEW',
          newStatus: 'NEW',
          responderNotes: '⚠️ Emergency SOS triggered by unverified student account. Dispatched under life-safety emergency fallback policy for authorized staff verification.',
        },
      });
    }

    // Audit trail for sensitive / confidential escalation
    if (incident.isSensitive || incident.independentReviewerOnly) {
      await prisma.incidentStatusHistory.create({
        data: {
          incidentId: incident.id,
          updatedBy: reporterId,
          previousStatus: 'NEW',
          newStatus: 'NEW',
          responderNotes: `🔒 Confidential / Sensitive complaint submitted${accusedDepartment ? ` (Involving: ${accusedDepartment})` : ''}. Escalated directly to Independent Oversight Reviewer.`,
        },
      });
    }

    // Audit trail for location verification review signal
    if (evaluatedLocation && evaluatedLocation.isMismatch) {
      await prisma.incidentStatusHistory.create({
        data: {
          incidentId: incident.id,
          updatedBy: reporterId,
          previousStatus: 'NEW',
          newStatus: 'NEW',
          responderNotes: `📍 Location discrepancy noted: Selected location is ~${evaluatedLocation.mismatchDistanceMeters}m from current GPS fix. ${evaluatedLocation.mismatchConfirmed ? 'Reporter confirmed incident occurred elsewhere.' : 'Review signal recorded for reviewer verification.'}`,
        },
      });
    }

    // Alert safety staff (in-app center rows + best-effort push).
    // Fire-and-forget: the reporter's HTTP response must never wait on
    // (or fail with) notification delivery.
    notifyNewIncident(incident).catch((err) => console.error('[notify]', err.message));

    // If SOS alert: initiate automatic server-side SOS dispatch (SMS to emergency contacts & responders)
    // and start the 60-second backend escalation timer
    if (incident.isSos) {
      (async () => {
        try {
          const [contacts, reporter] = await Promise.all([
            prisma.emergencyContact.findMany({ where: { userId: reporterId } }),
            prisma.user.findUnique({ where: { id: reporterId } }),
          ]);
          await dispatchSosIncident({ incident, reporter, contacts });
        } catch (err) {
          console.error('[dispatch] Automatic SOS dispatch error:', err.message);
        }
      })();

      // Start 60-second escalation timer on the backend
      scheduleEscalation(incident.id);
    }

    res.status(201).json({ success: true, data: { incident } });
  } catch (err) {
    next(err);
  }
}

/** Notification helper — alerts safety staff (restricted to ADMIN for sensitive cases). */
async function notifyNewIncident(incident) {
  let staff = await loadSafetyStaff();
  if (incident.isSensitive || incident.independentReviewerOnly) {
    staff = staff.filter((u) => u.role === 'ADMIN');
  }
  if (!staff || staff.length === 0) return;

  const where = incident.location && incident.location.campusLandmark;
  const isSos = incident.isSos;
  const isUnverified = incident.title && incident.title.includes('[UNVERIFIED SENDER]');
  let title = isSos
    ? '🚨 Emergency SOS alert'
    : incident.isSensitive
    ? '🔒 Confidential Report: Independent Oversight Review Required'
    : `New ${CATEGORY_LABELS[incident.category] || 'report'} needs attention`;
  if (isSos && isUnverified) {
    title = '🚨 [UNVERIFIED SENDER] Emergency SOS alert';
  }
  const body = where ? `${incident.title} — ${where}` : incident.title;
  await notifyUsers(staff, {
    type: isSos ? 'SOS_ALERT' : 'NEW_INCIDENT',
    title,
    body,
    incidentId: incident.id,
    pushData: {
      incidentId: incident.id,
      priority: incident.priority,
      unverifiedSender: isUnverified,
      isSensitive: incident.isSensitive,
    },
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
// incidents; responders may view non-sensitive incidents; ADMIN may view all.
async function getIncidentById(req, res, next) {
  try {
    const incident = await prisma.incident.findUnique({
      where: { id: req.params.id },
      include: { ...incidentInclude, reporter: { select: { id: true, name: true } } },
    });

    if (!incident) throw notFound('Incident not found.', 'INCIDENT_NOT_FOUND');

    const isOwner = incident.reporterId === req.user.id;
    const isAdmin = req.user.role === 'ADMIN';

    // Sensitive / Independent Review complaints:
    // Strictly restricted to the owner or ADMIN (independent oversight authority).
    // Standard RESPONDER role cannot view sensitive cases or cases with independentReviewerOnly.
    if (incident.isSensitive || incident.independentReviewerOnly) {
      if (!isOwner && !isAdmin) {
        throw forbidden(
          'This is a confidential / sensitive report restricted to authorized independent reviewers.',
          'SENSITIVE_ACCESS_RESTRICTED'
        );
      }
    } else {
      if (!['RESPONDER', 'ADMIN'].includes(req.user.role) && !isOwner) {
        throw forbidden('You can only view your own reports.', 'NOT_YOUR_INCIDENT');
      }
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

// GET /api/incidents/:id/photo — authenticated + IDOR protected.
// Serves photo evidence strictly to the reporter (owner) or RESPONDER / ADMIN.
async function getIncidentPhoto(req, res, next) {
  try {
    const incident = await prisma.incident.findUnique({
      where: { id: req.params.id },
      select: { id: true, reporterId: true, photoPath: true },
    });

    if (!incident) throw notFound('Incident not found.', 'INCIDENT_NOT_FOUND');
    if (!incident.photoPath) throw notFound('This report has no photo attached.', 'NO_PHOTO');

    const isOwner = incident.reporterId === req.user.id;
    const isStaff = ['RESPONDER', 'ADMIN'].includes(req.user.role);
    if (!isOwner && !isStaff) {
      throw forbidden('You do not have permission to view this incident photo.', 'NOT_YOUR_INCIDENT');
    }

    const filename = path.basename(incident.photoPath);
    const absolutePath = path.join(__dirname, '..', '..', 'uploads', filename);

    if (!fs.existsSync(absolutePath)) {
      throw notFound('Photo evidence file does not exist on disk.', 'FILE_NOT_FOUND');
    }

    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(absolutePath);
  } catch (err) {
    next(err);
  }
}

// PATCH /api/incidents/:id — owner-only, only while status === 'NEW',
// non-SOS incidents only. Allows correcting title, description, category.
async function updateIncident(req, res, next) {
  try {
    const incident = await prisma.incident.findUnique({
      where: { id: req.params.id },
      select: { id: true, reporterId: true, status: true, isSos: true },
    });
    if (!incident) throw notFound('Incident not found.', 'INCIDENT_NOT_FOUND');
    if (incident.reporterId !== req.user.id)
      throw forbidden('Only the reporter can edit this incident.', 'NOT_YOUR_INCIDENT');
    if (incident.status !== 'NEW')
      throw unprocessable(
        'Incidents can only be edited before they are acknowledged by a responder.',
        'INCIDENT_ALREADY_ACKNOWLEDGED'
      );
    if (incident.isSos)
      throw unprocessable(
        'Emergency SOS alerts cannot be edited after submission.',
        'SOS_EDIT_FORBIDDEN'
      );

    const { title, description, category } = req.body || {};
    const updates = {};

    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim().length < 5 || title.trim().length > 120)
        throw unprocessable('Title must be between 5 and 120 characters.', 'VALIDATION_ERROR');
      updates.title = title.trim();
    }
    if (description !== undefined) {
      if (typeof description !== 'string' || description.trim().length < 10 || description.trim().length > 2000)
        throw unprocessable('Description must be between 10 and 2000 characters.', 'VALIDATION_ERROR');
      updates.description = description.trim();
    }
    if (category !== undefined) {
      if (!CLIENT_CATEGORIES.includes(category))
        throw unprocessable('Category must be one of: ' + CLIENT_CATEGORIES.join(', ') + '.', 'INVALID_CATEGORY');
      updates.category = category;
    }

    if (Object.keys(updates).length === 0)
      throw unprocessable('Provide at least one field to update (title, description, or category).', 'NO_CHANGES');

    const updated = await prisma.incident.update({
      where: { id: incident.id },
      data: updates,
      include: { ...incidentInclude, reporter: { select: { id: true, name: true } } },
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
  updateIncident,
  uploadIncidentPhoto,
  deleteIncidentPhoto,
  getIncidentPhoto,
};
