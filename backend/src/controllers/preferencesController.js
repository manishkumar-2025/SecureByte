// ─────────────────────────────────────────────────────────────
// SecureByte — Notification preferences controller
//
// GET /api/me/preferences → current user's prefs (merged with
//   defaults so new keys never break older clients).
// PUT /api/me/preferences → partial update; unknown keys are
//   rejected, known keys must be booleans. Saved as JSON on the
//   user row and honoured by the notify pipeline.
// ─────────────────────────────────────────────────────────────
const { prisma } = require('../lib/prisma');
const { unprocessable } = require('../utils/errors');
const { readPrefs, DEFAULT_PREFS } = require('../lib/notify');

const PREFERENCE_KEYS = Object.keys(DEFAULT_PREFS); // push, sosAlerts, statusUpdates, announcements

async function getPreferences(req, res, next) {
  try {
    res.status(200).json({ success: true, data: { preferences: readPrefs(req.user) } });
  } catch (err) {
    next(err);
  }
}

async function updatePreferences(req, res, next) {
  try {
    const incoming = req.validated.preferences;
    const current = readPrefs(req.user);
    const nextPrefs = { ...current };

    for (const [key, value] of Object.entries(incoming)) {
      if (!PREFERENCE_KEYS.includes(key)) {
        throw unprocessable(`Unknown preference "${key}". Allowed: ${PREFERENCE_KEYS.join(', ')}.`, 'VALIDATION_ERROR');
      }
      if (typeof value !== 'boolean') {
        throw unprocessable(`Preference "${key}" must be true or false.`, 'VALIDATION_ERROR');
      }
      nextPrefs[key] = value;
    }

    await prisma.user.update({ where: { id: req.user.id }, data: { notificationPrefs: nextPrefs } });
    res.status(200).json({ success: true, data: { preferences: nextPrefs } });
  } catch (err) {
    next(err);
  }
}

module.exports = { getPreferences, updatePreferences };
