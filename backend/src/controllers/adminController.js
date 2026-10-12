// ─────────────────────────────────────────────────────────────
// SecureByte — Analytics & admin controllers
//
// GET /api/responder/analytics  → RESPONDER + ADMIN. Operational
//   statistics computed from real incident data (no mock numbers).
// GET /api/admin/users          → ADMIN only. Paginated directory
//   with per-role counts. Deliberately excludes password hashes and
//   any secret material.
// ─────────────────────────────────────────────────────────────
const { prisma } = require('../lib/prisma');
const { parsePagination } = require('../utils/pagination');
const { notFound, unprocessable } = require('../utils/errors');

// GET /api/responder/analytics
async function getAnalytics(req, res, next) {
  try {
    const now = Date.now();
    const since7d = new Date(now - 7 * 24 * 3600 * 1000);
    const since24h = new Date(now - 24 * 3600 * 1000);
    const since30d = new Date(now - 30 * 24 * 3600 * 1000);

    // Parallel aggregation queries — all cheap indexed counts.
    const [byStatus, byCategory, total, last24h, sosLast24h, openNow, recent, resolvedRecent, checkinSafe, checkinHelp] =
      await Promise.all([
        prisma.incident.groupBy({ by: ['status'], _count: { _all: true } }),
        prisma.incident.groupBy({ by: ['category'], _count: { _all: true } }),
        prisma.incident.count(),
        prisma.incident.count({ where: { createdAt: { gte: since24h } } }),
        prisma.incident.count({ where: { isSos: true, createdAt: { gte: since24h } } }),
        prisma.incident.count({ where: { status: { in: ['NEW', 'ACKNOWLEDGED', 'IN_PROGRESS'] } } }),
        prisma.incident.findMany({
          where: { createdAt: { gte: since7d } },
          select: { createdAt: true, isSos: true },
        }),
        prisma.incident.findMany({
          where: { status: 'RESOLVED', updatedAt: { gte: since30d } },
          select: { createdAt: true, updatedAt: true },
          take: 500,
          orderBy: { updatedAt: 'desc' },
        }),
        prisma.checkIn.count({ where: { status: 'SAFE', createdAt: { gte: since24h } } }),
        prisma.checkIn.count({ where: { status: 'NEEDS_HELP', createdAt: { gte: since24h } } }),
      ]);

    // 7-day series (oldest → newest). Includes SOS split per day.
    const series = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(now - i * 24 * 3600 * 1000);
      dayStart.setUTCHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);
      const dayItems = recent.filter((r) => r.createdAt >= dayStart && r.createdAt < dayEnd);
      series.push({
        date: dayStart.toISOString().slice(0, 10),
        total: dayItems.length,
        sos: dayItems.filter((r) => r.isSos).length,
      });
    }

    // Average resolution time over resolved incidents (minutes, 1 dp).
    // Uses direct database aggregation for high-scale performance with fallback.
    let avgResolutionMinutes = null;
    try {
      const rawAvg = await prisma.$queryRaw`
        SELECT AVG(EXTRACT(EPOCH FROM ("updatedAt" - "createdAt")) / 60) AS avg_min
        FROM "incidents"
        WHERE "status" = 'RESOLVED' AND "updatedAt" >= ${since30d}
      `;
      if (rawAvg && rawAvg[0] && rawAvg[0].avg_min != null) {
        avgResolutionMinutes = Math.round(Number(rawAvg[0].avg_min) * 10) / 10;
      }
    } catch (e) {
      if (resolvedRecent.length > 0) {
        const totalMs = resolvedRecent.reduce(
          (sum, r) => sum + (new Date(r.updatedAt).getTime() - new Date(r.createdAt).getTime()),
          0
        );
        avgResolutionMinutes = Math.round((totalMs / resolvedRecent.length / 60000) * 10) / 10;
      }
    }

    const statusCounts = {};
    byStatus.forEach((row) => { statusCounts[row.status] = row._count._all; });
    const categoryCounts = {};
    byCategory.forEach((row) => { categoryCounts[row.category] = row._count._all; });

    res.status(200).json({
      success: true,
      data: {
        totals: { incidents: total, last24h, sosLast24h, openNow },
        byStatus: statusCounts,
        byCategory: categoryCounts,
        series7d: series,
        avgResolutionMinutes,
        checkInsLast24h: { safe: checkinSafe, needsHelp: checkinHelp },
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/users?page=&limit=&role=&q=
async function listUsers(req, res, next) {
  try {
    const { page, limit, skip, take } = parsePagination(req.query);
    const where = {};
    if (req.query.role && ['STUDENT', 'RESPONDER', 'ADMIN'].includes(req.query.role)) {
      where.role = req.query.role;
    }
    if (typeof req.query.q === 'string' && req.query.q.trim() !== '') {
      const q = req.query.q.trim().slice(0, 100);
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          requestedRole: true,
          verificationStatus: true,
          department: true,
          designation: true,
          studentId: true,
          createdAt: true,
          lockedUntil: true,
          _count: { select: { incidentsReported: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      data: { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } },
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/verifications?page=&limit=&status=&role=&q=
async function listVerifications(req, res, next) {
  try {
    const { page, limit, skip, take } = parsePagination(req.query);
    const where = {};
    if (req.query.status && typeof req.query.status === 'string') {
      where.verificationStatus = req.query.status.toUpperCase();
    }
    if (req.query.role && typeof req.query.role === 'string') {
      where.requestedRole = req.query.role.toUpperCase();
    }
    if (typeof req.query.q === 'string' && req.query.q.trim() !== '') {
      const q = req.query.q.trim().slice(0, 100);
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { studentId: { contains: q, mode: 'insensitive' } },
        { department: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          requestedRole: true,
          verificationStatus: true,
          gender: true,
          department: true,
          designation: true,
          studentId: true,
          enrollmentNo: true,
          course: true,
          yearOrSemester: true,
          residencyType: true,
          hostelName: true,
          roomOrOffice: true,
          guardBadgeId: true,
          assignedZone: true,
          shift: true,
          rejectionReason: true,
          reviewedBy: true,
          reviewedAt: true,
          createdAt: true,
        },
      }),
      prisma.user.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        items,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/admin/verifications/:id/review
// Body: { action: 'APPROVE' | 'REJECT' | 'RESUBMIT', role, rejectionReason, reviewerNotes }
async function reviewVerification(req, res, next) {
  try {
    const userId = req.params.id;
    const { action, role, rejectionReason, reviewerNotes } = req.body || {};

    const targetUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser) throw notFound('User account not found.', 'USER_NOT_FOUND');

    const validActions = ['APPROVE', 'REJECT', 'RESUBMIT'];
    if (!validActions.includes(String(action).toUpperCase())) {
      throw unprocessable('Action must be APPROVE, REJECT, or RESUBMIT.', 'INVALID_ACTION');
    }

    const normalizedAction = String(action).toUpperCase();
    const updateData = {
      reviewedBy: req.user.id,
      reviewedAt: new Date(),
    };

    let assignedRole = targetUser.role;

    if (normalizedAction === 'APPROVE') {
      const allowedRoles = ['STUDENT', 'FACULTY', 'WARDEN', 'SECURITY', 'STAFF', 'SENSITIVE_OFFICER', 'RESPONDER', 'ADMIN'];
      assignedRole = role && allowedRoles.includes(String(role).toUpperCase())
        ? String(role).toUpperCase()
        : (targetUser.requestedRole && allowedRoles.includes(targetUser.requestedRole) ? targetUser.requestedRole : 'STUDENT');

      updateData.role = assignedRole;
      updateData.isVerified = true;
      updateData.verificationStatus = 'APPROVED';
      updateData.rejectionReason = null;

      // In-app alert
      await prisma.notification.create({
        data: {
          userId: targetUser.id,
          type: 'SYSTEM',
          title: 'Campus Verification Approved 🎉',
          body: `Your identity has been verified. You now have full access with role: ${assignedRole}.`,
        },
      }).catch(() => {});
    } else if (normalizedAction === 'REJECT') {
      updateData.verificationStatus = 'REJECTED';
      updateData.rejectionReason = rejectionReason || 'Verification request was rejected by administration.';

      await prisma.notification.create({
        data: {
          userId: targetUser.id,
          type: 'SYSTEM',
          title: 'Verification Request Update ⚠️',
          body: `Your verification request was not approved: ${updateData.rejectionReason}`,
        },
      }).catch(() => {});
    } else if (normalizedAction === 'RESUBMIT') {
      updateData.verificationStatus = 'RESUBMIT_REQUIRED';
      updateData.rejectionReason = rejectionReason || 'Please resubmit your verification details with valid college credentials.';

      await prisma.notification.create({
        data: {
          userId: targetUser.id,
          type: 'SYSTEM',
          title: 'Verification Resubmission Requested 📝',
          body: updateData.rejectionReason,
        },
      }).catch(() => {});
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    // Immutable audit log
    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        action: `VERIFICATION_${normalizedAction}`,
        targetId: userId,
        targetType: 'USER',
        details: {
          previousStatus: targetUser.verificationStatus,
          newStatus: updateData.verificationStatus,
          assignedRole,
          reviewerNotes: reviewerNotes || null,
          rejectionReason: updateData.rejectionReason || null,
        },
      },
    }).catch(() => {});

    res.status(200).json({
      success: true,
      data: {
        message: `Verification ${normalizedAction.toLowerCase()}d successfully.`,
        user: {
          id: updated.id,
          name: updated.name,
          email: updated.email,
          role: updated.role,
          verificationStatus: updated.verificationStatus,
          reviewedBy: updated.reviewedBy,
          reviewedAt: updated.reviewedAt,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/admin/users/:id/role
// Body: { role, designation, department }
async function updateUserRole(req, res, next) {
  try {
    const userId = req.params.id;
    const { role, designation, department } = req.body || {};

    const allowedRoles = ['STUDENT', 'FACULTY', 'WARDEN', 'SECURITY', 'STAFF', 'SENSITIVE_OFFICER', 'RESPONDER', 'ADMIN', 'SYSTEM_ADMIN'];
    if (!role || !allowedRoles.includes(String(role).toUpperCase())) {
      throw unprocessable(`Role must be one of: ${allowedRoles.join(', ')}`, 'INVALID_ROLE');
    }

    const targetUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser) throw notFound('User not found.', 'USER_NOT_FOUND');

    const updateData = { role: String(role).toUpperCase() };
    if (designation && typeof designation === 'string') updateData.designation = designation.trim().slice(0, 80);
    if (department && typeof department === 'string') updateData.department = department.trim().slice(0, 80);

    const updated = await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        action: 'ROLE_PROMOTED',
        targetId: userId,
        targetType: 'USER',
        details: { previousRole: targetUser.role, newRole: updateData.role },
      },
    }).catch(() => {});

    res.status(200).json({
      success: true,
      data: {
        message: `User role updated to ${updateData.role}.`,
        user: {
          id: updated.id,
          name: updated.name,
          email: updated.email,
          role: updated.role,
          designation: updated.designation,
          department: updated.department,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/audit-logs
async function listAuditLogs(req, res, next) {
  try {
    const { page, limit, skip, take } = parsePagination(req.query);
    const where = {};
    if (req.query.action && typeof req.query.action === 'string') {
      where.action = req.query.action.trim();
    }
    if (req.query.actorId && typeof req.query.actorId === 'string') {
      where.actorId = req.query.actorId.trim();
    }

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { actor: { select: { id: true, name: true, email: true, role: true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      data: { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAnalytics,
  listUsers,
  listVerifications,
  reviewVerification,
  updateUserRole,
  listAuditLogs,
};
