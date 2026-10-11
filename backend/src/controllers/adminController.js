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

module.exports = { getAnalytics, listUsers };
