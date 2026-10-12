// ─────────────────────────────────────────────────────────────
// SecureByte — central notify helper (in-app center + push)
//
// Every alerting flow (new incident, status change, help check-in,
// announcement) goes through here so behaviour is consistent:
//   1. A Notification row is ALWAYS written for each eligible user
//      (the in-app center works even when a device is offline / push
//      is unavailable — push is best-effort, the record is not).
//   2. Push is sent only to users whose notificationPrefs allow it.
//   3. Never throws — alerting must not break the main request.
// ─────────────────────────────────────────────────────────────

const { prisma } = require('../lib/prisma');
const { sendToUsers } = require('./push');

const DEFAULT_PREFS = { push: true, sosAlerts: true, statusUpdates: true, announcements: true };

/** Reads a user's stored prefs defensively (bad JSON → defaults). */
function readPrefs(user) {
  const raw = user && user.notificationPrefs;
  if (!raw || typeof raw !== 'object') return DEFAULT_PREFS;
  return { ...DEFAULT_PREFS, ...raw };
}

/**
 * Creates Notification rows for the given users and (best-effort) pushes
 * to the subset that has push enabled.
 *
 * @param {object[]} users  Prisma user rows (must include id + notificationPrefs)
 * @param {{ type: string, title: string, body: string, incidentId?: string,
 *          pushTitle?: string, pushData?: object, prefKey?: string }} options
 *   prefKey — which boolean in notificationPrefs gates delivery
 *   ('sosAlerts' | 'statusUpdates' | 'announcements'). Rows are written
 *   regardless; prefKey only gates the PUSH send.
 */
async function notifyUsers(users, { type, title, body, incidentId = null, pushTitle, pushData = {}, prefKey }) {
  try {
    const targets = (Array.isArray(users) ? users : []).filter((u) => u && u.id);
    if (targets.length === 0) return { created: 0, pushed: 0 };

    const created = await prisma.notification.createMany({
      data: targets.map((u) => ({
        userId: u.id,
        type,
        title: String(title).slice(0, 160),
        body: String(body).slice(0, 500),
        incidentId,
      })),
      skipDuplicates: true,
    });

    const pushUsers = prefKey
      ? targets.filter((u) => readPrefs(u)[prefKey] !== false && readPrefs(u).push !== false)
      : targets.filter((u) => readPrefs(u).push !== false);

    let pushed = 0;
    if (pushUsers.length > 0) {
      pushed = await sendToUsers(
        pushUsers.map((u) => u.id),
        { title: pushTitle || title, body, data: { type, incidentId, ...pushData } }
      );
    }

    return { created: created.count, pushed };
  } catch (err) {
    console.error('[notify] notifyUsers failed (ignored):', err.message);
    return { created: 0, pushed: 0 };
  }
}

/** Loads every safety responder, security officer, warden and admin (id + prefs only) — the alert audience. */
async function loadSafetyStaff() {
  return prisma.user.findMany({
    where: { role: { in: ['RESPONDER', 'ADMIN', 'SECURITY', 'WARDEN', 'SENSITIVE_OFFICER'] } },
    select: { id: true, notificationPrefs: true },
  });
}

/** Loads one user (id + prefs) or null. */
async function loadUser(userId) {
  if (!userId) return null;
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, notificationPrefs: true },
  });
}

module.exports = { notifyUsers, loadSafetyStaff, loadUser, readPrefs, DEFAULT_PREFS };
