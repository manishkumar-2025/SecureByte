const { prisma } = require('../lib/prisma');

// POST /api/devices/push-token — authenticated. Registers (or re-points) an
// Expo push token for the signed-in device. Upsert by token: if the same
// physical device signs in with another account, the token follows the
// newest login — otherwise the previous account keeps getting notified.
async function registerPushToken(req, res, next) {
  try {
    const { token, platform } = req.validated;

    const existing = await prisma.pushToken.findUnique({ where: { token } });
    const data = existing
      ? { userId: req.user.id, platform }
      : { userId: req.user.id, token, platform };

    const pushToken = await prisma.pushToken.upsert({
      where: { token },
      update: data,
      create: data,
      select: { id: true, platform: true, createdAt: true },
    });

    res.status(existing ? 200 : 201).json({
      success: true,
      data: { pushToken, message: 'This device will now receive SecureByte alerts.' },
    });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/devices/push-token — authenticated. Un-registers a device
// (used on sign-out so a shared phone stops receiving the next user's alerts).
async function deletePushToken(req, res, next) {
  try {
    const { token } = req.validated;
    await prisma.pushToken.deleteMany({ where: { token, userId: req.user.id } });
    res.status(200).json({ success: true, data: { message: 'Device unregistered.' } });
  } catch (err) {
    next(err);
  }
}

module.exports = { registerPushToken, deletePushToken };
