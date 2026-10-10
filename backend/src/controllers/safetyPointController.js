// ─────────────────────────────────────────────────────────────
// SecureByte — Safety points (campus map resources)
//
// Read-only directory of safety resources: emergency exits, AEDs,
// first-aid stations, shelters, fire extinguishers and security
// offices. Supports ?category= filtering and ?lat=&lng=&radius= to
// return nearest-first results with precomputed distances.
// ─────────────────────────────────────────────────────────────
const { prisma } = require('../lib/prisma');
const { unprocessable } = require('../utils/errors');
const { SAFETY_POINT_CATEGORIES } = require('../utils/constants');

const EARTH_RADIUS_M = 6371000;

/** Haversine distance in metres between two WGS-84 coordinates. */
function distanceMeters(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

// GET /api/safety-points?category=&lat=&lng=&radius=
async function listSafetyPoints(req, res, next) {
  try {
    const where = {};
    if (req.query.category) {
      if (!SAFETY_POINT_CATEGORIES.includes(req.query.category)) {
        throw unprocessable(
          `Category must be one of: ${SAFETY_POINT_CATEGORIES.join(', ')}.`,
          'VALIDATION_ERROR'
        );
      }
      where.category = req.query.category;
    }

    const items = await prisma.safetyPoint.findMany({ where, orderBy: { name: 'asc' } });

    // Optional geo-sort: when lat+lng (+radius in metres, default 2000)
    // are provided, annotate each point with distanceMeters and filter.
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const hasCoords =
      Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

    let out = items;
    if (hasCoords) {
      const radiusRaw = Number(req.query.radius);
      const radius = Number.isFinite(radiusRaw) && radiusRaw > 0 ? Math.min(radiusRaw, 50000) : 2000;
      out = items
        .map((p) => ({ ...p, distanceMeters: Math.round(distanceMeters(lat, lng, p.latitude, p.longitude)) }))
        .filter((p) => p.distanceMeters <= radius)
        .sort((a, b) => a.distanceMeters - b.distanceMeters);
    }

    res.status(200).json({ success: true, data: { items: out, total: out.length } });
  } catch (err) {
    next(err);
  }
}

module.exports = { listSafetyPoints, distanceMeters };
