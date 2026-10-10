// ─────────────────────────────────────────────────────────────
// SecureByte — Expo push notification service (server side)
//
// Talks to Expo's push API directly with the built-in fetch (Node 18+),
// so there is no extra SDK dependency and CommonJS/jest keep working.
//   send   → POST https://exp.host/--/api/v2/push/send
//   ticket → { status: 'ok', id } | { status: 'error', ... }
//   receipts (optional second pass) → POST /--/api/v2/push/getReceipts
//
// Design rules (important):
//   1. Push is BEST-EFFORT and must NEVER break the main request.
//      Every failure is caught and logged; callers fire-and-forget.
//   2. Invalid/expired tokens (e.g. app uninstalled) are removed from
//      the database automatically (DeviceNotRegistered).
//   3. In TEST mode this module is a no-op, so jest never touches
//      the network.
//   4. No EXPO_PUSH_ACCESS_TOKEN configured? Expo still delivers to
//      Expo Go tokens at a lower rate limit — fine for the demo.
//      Production apps should set EXPO_PUSH_ACCESS_TOKEN (EAS dashboard).
// ─────────────────────────────────────────────────────────────

const { env } = require('../config/env');
const { prisma } = require('../lib/prisma');

const EXPO_API = 'https://exp.host/--/api/v2/push';
// Expo's documented hard limit per request.
const CHUNK_SIZE = 100;

const TOKEN_RE = /^Expo(?:nent)?PushToken\[[^\s]+\]$/;

function isExpoPushToken(token) {
  return typeof token === 'string' && TOKEN_RE.test(token);
}

async function postJson(url, body) {
  // Node 18+ global fetch — undici decompresses gzip automatically.
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.EXPO_PUSH_ACCESS_TOKEN
        ? { Authorization: `Bearer ${process.env.EXPO_PUSH_ACCESS_TOKEN}` }
        : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Expo push API responded ${res.status}`);
  }
  return res.json();
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Sends a push notification to every registered device of the given users.
 * Returns the number of messages accepted for delivery. NEVER throws.
 *
 * @param {string[]} userIds
 * @param {{ title: string, body: string, data?: object }} payload
 */
async function sendToUsers(userIds, { title, body, data = {} }) {
  try {
    if (env.isTest || env.pushDisabled || !Array.isArray(userIds) || userIds.length === 0) {
      return 0;
    }

    const tokens = await prisma.pushToken.findMany({
      where: { userId: { in: userIds } },
      select: { token: true },
    });
    const valid = tokens.filter((t) => isExpoPushToken(t.token)).map((t) => t.token);
    if (valid.length === 0) return 0;

    const messages = valid.map((to) => ({
      to,
      sound: 'default',
      title: String(title).slice(0, 120),
      body: String(body).slice(0, 300),
      data,
      priority: 'high',
      channelId: 'securebyte-alerts',
    }));

    let accepted = 0;
    for (const group of chunk(messages, CHUNK_SIZE)) {
      try {
        const json = await postJson(`${EXPO_API}/send`, group);
        const tickets = (json && json.data) || [];

        const deadTokens = [];
        const ticketIds = [];
        tickets.forEach((ticket, i) => {
          if (!ticket) return;
          if (ticket.status === 'ok' && ticket.id) {
            ticketIds.push(ticket.id);
            return;
          }
          if (ticket.status === 'error') {
            console.error(`[push] delivery error: ${ticket.message || ticket.code || 'unknown'}`);
            if (ticket.details && ticket.details.error === 'DeviceNotRegistered') {
              deadTokens.push(group[i].to);
            }
          }
        });

        if (deadTokens.length > 0) await removeTokens(deadTokens);
        accepted += group.length - deadTokens.length;

        // Optional second pass: accepted tickets can still fail at delivery
        // time. Kept best-effort — Expo may not have receipts ready yet.
        if (ticketIds.length > 0) {
          try {
            const receiptsJson = await postJson(`${EXPO_API}/getReceipts`, { ids: ticketIds });
            const stale = [];
            ticketIds.forEach((id, i) => {
              const r = receiptsJson.data && receiptsJson.data[id];
              if (r && r.status === 'error' && r.details && r.details.error === 'DeviceNotRegistered') {
                stale.push(group[i].to);
              }
            });
            if (stale.length > 0) await removeTokens(stale);
          } catch (err) {
            console.error('[push] receipt check skipped:', err.message);
          }
        }
      } catch (err) {
        console.error('[push] chunk send failed:', err.message);
      }
    }

    return accepted;
  } catch (err) {
    console.error('[push] sendToUsers failed (ignored):', err.message);
    return 0;
  }
}

/** Removes tokens that Expo reports as not registered (best effort). */
async function removeTokens(tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0) return;
  try {
    await prisma.pushToken.deleteMany({ where: { token: { in: tokens } } });
  } catch (err) {
    console.error('[push] token cleanup failed (ignored):', err.message);
  }
}

module.exports = { sendToUsers, removeTokens, isExpoPushToken };
