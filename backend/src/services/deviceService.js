const crypto = require('crypto');
const { prisma } = require('../lib/prisma');
const { notifyUsers } = require('../lib/notify');

/**
 * Derives a consistent device identifier from request headers (x-device-id, User-Agent, IP).
 */
function extractDeviceIdentifier(req) {
  const explicitId = req.headers['x-device-id'] || req.headers['x-device-identifier'];
  if (explicitId && typeof explicitId === 'string' && explicitId.trim().length >= 8) {
    return explicitId.trim();
  }

  // Derive stable fingerprint from User-Agent and client IP
  const userAgent = req.headers['user-agent'] || 'unknown-client';
  const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';
  return crypto.createHash('sha256').update(`${userAgent}:${ip}`).digest('hex').substring(0, 32);
}

/**
 * Handles device session logging on user login.
 * Detects new-device logins and triggers security notification.
 * Asynchronous & fail-safe — never breaks or blocks sign-in.
 */
async function trackDeviceSession(req, userId) {
  try {
    const deviceIdentifier = extractDeviceIdentifier(req);
    const userAgent = (req.headers['user-agent'] || 'unknown').substring(0, 255);
    const ipAddress = (req.ip || req.connection?.remoteAddress || 'unknown').substring(0, 45);

    const existing = await prisma.deviceSession.findUnique({
      where: {
        userId_deviceIdentifier: {
          userId,
          deviceIdentifier,
        },
      },
    });

    if (existing) {
      // Known device — update lastSeenAt
      await prisma.deviceSession.update({
        where: { id: existing.id },
        data: { lastSeenAt: new Date(), ipAddress, userAgent },
      });
      return { isNewDevice: false, deviceSession: existing };
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return { isNewDevice: false };

    // New device login!
    const newSession = await prisma.deviceSession.create({
      data: {
        userId,
        deviceIdentifier,
        userAgent,
        ipAddress,
        isTrusted: true,
      },
    });

    // Alert user with high-priority security notification
    await notifyUsers([user], {
      type: 'SECURITY_ALERT',
      title: '🔒 New sign-in detected',
      body: `Your SecureByte account was accessed from a new device (${userAgent.slice(0, 40)}) on ${new Date().toLocaleDateString()}. If this wasn't you, reset your password immediately.`,
    });

    return { isNewDevice: true, deviceSession: newSession };
  } catch (err) {
    console.error('[device] trackDeviceSession error (ignored):', err.message);
    return { isNewDevice: false };
  }
}

module.exports = {
  extractDeviceIdentifier,
  trackDeviceSession,
};
