const crypto = require('crypto');
const { env } = require('../config/env');
const { prisma } = require('../lib/prisma');
const { signToken } = require('../utils/jwt');
const { hashPassword, verifyPassword } = require('../utils/password');
const { unauthorized, conflict, forbidden, unprocessable, locked, badRequest } = require('../utils/errors');
const { readPrefs } = require('../lib/notify');
const { sendOtp, verifyOtp } = require('../services/otpService');
const { trackDeviceSession } = require('../services/deviceService');

function safeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone || null,
    role: user.role,
    requestedRole: user.requestedRole || user.role,
    verificationStatus: user.verificationStatus || (user.isVerified ? 'APPROVED' : 'UNVERIFIED'),
    gender: user.gender || null,
    department: user.department || null,
    designation: user.designation || null,
    studentId: user.studentId || null,
    enrollmentNo: user.enrollmentNo || null,
    course: user.course || null,
    yearOrSemester: user.yearOrSemester || null,
    residencyType: user.residencyType || null,
    hostelName: user.hostelName || null,
    roomOrOffice: user.roomOrOffice || null,
    guardBadgeId: user.guardBadgeId || null,
    assignedZone: user.assignedZone || null,
    shift: user.shift || null,
    idProofUrl: user.idProofUrl || null,
    rejectionReason: user.rejectionReason || null,
    reviewedBy: user.reviewedBy || null,
    reviewedAt: user.reviewedAt || null,
    emailVerified: Boolean(user.emailVerified),
    phoneVerified: Boolean(user.phoneVerified),
    isVerified: Boolean(user.isVerified),
    createdAt: user.createdAt,
    // Prefs ride along with the profile so the app can render toggle
    // states without an extra round-trip.
    notificationPrefs: readPrefs(user),
  };
}

/** Constant-time string comparison to avoid leaking the setup code via timing. */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// ── Refresh token helpers ─────────────────────────────────────
// The raw token is ONLY shown to the client once; the database stores a
// SHA-256 hash, so a stolen database dump cannot be replayed as sessions.

function hashRefreshToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

async function issueRefreshToken(userId) {
  const raw = crypto.randomBytes(48).toString('hex');
  const expiresAt = new Date(Date.now() + env.refreshTokenDays * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({
    data: { userId, tokenHash: hashRefreshToken(raw), expiresAt },
  });
  return raw;
}

/**
 * Validates a refresh token and ROTATES it: the presented token is revoked
 * and a fresh one is issued. Reuse of a revoked token is rejected, which
 * limits the damage of a leaked token window.
 */
async function rotateRefreshToken(raw) {
  if (typeof raw !== 'string' || raw.length < 32) {
    throw unauthorized('Invalid refresh token.', 'INVALID_REFRESH_TOKEN');
  }
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(raw) },
    include: { user: true },
  });

  if (!record || record.revokedAt || record.expiresAt < new Date()) {
    throw unauthorized('Refresh token is invalid or has expired. Please sign in again.', 'INVALID_REFRESH_TOKEN');
  }
  if (!record.user) {
    throw unauthorized('This account no longer exists.', 'USER_NOT_FOUND');
  }

  const nextRaw = crypto.randomBytes(48).toString('hex');
  const expiresAt = new Date(Date.now() + env.refreshTokenDays * 24 * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } }),
    prisma.refreshToken.create({
      data: { userId: record.userId, tokenHash: hashRefreshToken(nextRaw), expiresAt },
    }),
  ]);

  return { user: record.user, refreshToken: nextRaw };
}

// POST /api/auth/register — public. Base role is STUDENT.
// Clients can specify a requested campus account type (STUDENT, FACULTY, WARDEN, SECURITY, STAFF).
// Privileged administrative roles are granted solely after approval by College Admin.
async function register(req, res, next) {
  try {
    const { name, email, password } = req.validated;
    const phone = req.body && req.body.phone ? String(req.body.phone).trim() : null;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw conflict('An account with this email already exists. Try signing in instead.', 'EMAIL_IN_USE');
    }

    const allowedSelfRoles = ['STUDENT', 'FACULTY', 'WARDEN', 'SECURITY', 'STAFF'];
    let requestedRole = 'STUDENT';
    if (req.body && req.body.requestedRole && allowedSelfRoles.includes(String(req.body.requestedRole).toUpperCase())) {
      requestedRole = String(req.body.requestedRole).toUpperCase();
    }

    const passwordHash = await hashPassword(password);
    const requireVerif = env.requireVerification;
    const user = await prisma.user.create({
      data: {
        name,
        email,
        phone,
        passwordHash,
        role: 'STUDENT',
        requestedRole,
        verificationStatus: requireVerif ? 'PENDING' : 'APPROVED',
        isVerified: !requireVerif,
        emailVerified: !requireVerif,
        phoneVerified: !requireVerif,
      },
    });

    if (requireVerif) {
      sendOtp({ userId: user.id, channel: 'EMAIL', target: user.email }).catch(() => {});
      if (phone) {
        sendOtp({ userId: user.id, channel: 'SMS', target: phone }).catch(() => {});
      }
    }

    const accessToken = signToken(user);
    const refreshToken = await issueRefreshToken(user.id);
    res.status(201).json({ success: true, data: { user: safeUser(user), accessToken, refreshToken } });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/login — public. Returns the SAME generic error for
// "unknown email" and "wrong password" so attackers cannot probe which
// emails are registered (no user enumeration).
//
// Account lockout: after LOGIN_MAX_FAILED consecutive failures the account
// is locked for LOCKOUT_MINUTES — independent of the IP-based rate limiter.
async function login(req, res, next) {
  try {
    const { email, password } = req.validated;
    const user = await prisma.user.findUnique({ where: { email } });

    if (user && user.lockedUntil) {
      if (user.lockedUntil > new Date()) {
        const minutes = Math.max(1, Math.ceil((user.lockedUntil - Date.now()) / 60000));
        throw locked(
          `Too many failed sign-in attempts. This account is locked for about ${minutes} more minute(s).`,
          'ACCOUNT_LOCKED'
        );
      } else {
        // Lockout expired — reset the counter for a fresh cycle
        user.failedLoginCount = 0;
        user.lockedUntil = null;
        await prisma.user.update({
          where: { id: user.id },
          data: { failedLoginCount: 0, lockedUntil: null },
        });
      }
    }

    const ok = user ? await verifyPassword(password, user.passwordHash) : false;
    if (!ok) {
      if (user) {
        const failedLoginCount = user.failedLoginCount + 1;
        const shouldLock = failedLoginCount >= env.loginMaxFailed;
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginCount,
            ...(shouldLock ? { lockedUntil: new Date(Date.now() + env.lockoutMinutes * 60 * 1000) } : {}),
          },
        });
      }
      throw unauthorized('Invalid email or password.', 'INVALID_CREDENTIALS');
    }

    if (user.failedLoginCount > 0 || user.lockedUntil) {
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null },
      });
    }

    // Non-blocking device session tracking for suspicious or new-device detection
    trackDeviceSession(req, user.id).catch((err) => console.error('[device]', err.message));

    const accessToken = signToken(user);
    const refreshToken = await issueRefreshToken(user.id);
    res.status(200).json({
      success: true,
      data: {
        user: safeUser(user),
        accessToken,
        refreshToken,
        requiresVerification: !user.isVerified,
      },
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/refresh — public (the refresh token IS the credential).
// Exchanges a valid refresh token for a NEW access token + NEW refresh
// token (rotation). Lets the mobile app stay signed in silently without
// ever storing a long-lived password-derived credential.
async function refresh(req, res, next) {
  try {
    const { refreshToken } = req.body || {};
    const { user, refreshToken: nextRefreshToken } = await rotateRefreshToken(refreshToken);
    res.status(200).json({
      success: true,
      data: { user: safeUser(user), accessToken: signToken(user), refreshToken: nextRefreshToken },
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/logout — revokes the presented refresh token so it can no
// longer be exchanged. Idempotent: unknown/expired tokens still return 200.
async function logout(req, res, next) {
  try {
    const raw = (req.body && req.body.refreshToken) || '';
    if (typeof raw === 'string' && raw.length >= 32) {
      await prisma.refreshToken.updateMany({
        where: { tokenHash: hashRefreshToken(raw), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    res.status(200).json({ success: true, data: { message: 'Signed out.' } });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/auth/password — authenticated. Verifies the current password,
// then rotates the stored hash and revokes ALL refresh tokens of the user
// (every device must sign in again with the new password; the caller's
// short-lived access token keeps working until it expires).
async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.validated;

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) throw unauthorized('This account no longer exists.', 'USER_NOT_FOUND');

    const ok = await verifyPassword(currentPassword, user.passwordHash);
    if (!ok) {
      throw unprocessable('Your current password is incorrect.', 'INVALID_CURRENT_PASSWORD');
    }
    if (await verifyPassword(newPassword, user.passwordHash)) {
      throw unprocessable('The new password must be different from the current one.', 'PASSWORD_UNCHANGED');
    }

    const passwordHash = await hashPassword(newPassword);
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);

    res.status(200).json({
      success: true,
      data: { message: 'Password changed. Other devices have been signed out.' },
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/auth/me — authenticated. Returns the DB record of the token
// owner (fresh role, fresh everything).
async function me(req, res, next) {
  try {
    res.status(200).json({ success: true, data: { user: safeUser(req.user) } });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/setup-responder — CONTROLLED responder provisioning for
// the demo/ops team. Disabled unless RESPONDER_SETUP_CODE is configured,
// and protected by a shared secret code. Public responder registration
// is intentionally NOT offered.
async function setupResponder(req, res, next) {
  try {
    if (!env.responderSetupCode) {
      throw forbidden('Responder setup is disabled on this server.', 'SETUP_DISABLED');
    }

    const provided = (req.body && (req.body.setupCode || req.headers['x-responder-setup-code'])) || '';
    if (!provided || !safeEqual(provided, env.responderSetupCode)) {
      throw forbidden('Invalid responder setup code.', 'INVALID_SETUP_CODE');
    }

    const { name, email, password } = req.validated;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw conflict('An account with this email already exists.', 'EMAIL_IN_USE');
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        role: 'RESPONDER',
        isVerified: true,
        emailVerified: true,
        phoneVerified: true,
      },
    });

    const accessToken = signToken(user);
    const refreshToken = await issueRefreshToken(user.id);
    res.status(201).json({ success: true, data: { user: safeUser(user), accessToken, refreshToken } });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/send-otp — authenticated
async function sendOtpEndpoint(req, res, next) {
  try {
    const { channel } = req.validated;
    const upperChannel = String(channel).toUpperCase();
    if (!['EMAIL', 'SMS'].includes(upperChannel)) {
      throw unprocessable('Channel must be EMAIL or SMS.', 'INVALID_CHANNEL');
    }

    const target = req.validated.target || (upperChannel === 'EMAIL' ? req.user.email : req.user.phone);
    if (!target) {
      throw badRequest(`No ${upperChannel.toLowerCase()} target found. Please provide a destination ${upperChannel.toLowerCase()}.`, 'TARGET_REQUIRED');
    }

    const result = await sendOtp({ userId: req.user.id, channel: upperChannel, target });
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/verify-otp — authenticated
async function verifyOtpEndpoint(req, res, next) {
  try {
    const { channel, code } = req.validated;
    const upperChannel = String(channel).toUpperCase();
    if (!['EMAIL', 'SMS'].includes(upperChannel)) {
      throw unprocessable('Channel must be EMAIL or SMS.', 'INVALID_CHANNEL');
    }

    const result = await verifyOtp({ userId: req.user.id, channel: upperChannel, code });
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/verification — authenticated
// Allows user to submit college credentials & verification details.
async function submitVerification(req, res, next) {
  try {
    const {
      fullName,
      phone,
      gender,
      requestedRole,
      studentId,
      enrollmentNo,
      department,
      designation,
      course,
      yearOrSemester,
      residencyType,
      hostelName,
      roomOrOffice,
      guardBadgeId,
      assignedZone,
      shift,
      idProofUrl,
      emergencyContact,
    } = req.body || {};

    const allowedSelfRoles = ['STUDENT', 'FACULTY', 'WARDEN', 'SECURITY', 'STAFF'];
    const validRequestedRole = requestedRole && allowedSelfRoles.includes(String(requestedRole).toUpperCase())
      ? String(requestedRole).toUpperCase()
      : (req.user.requestedRole || 'STUDENT');

    const updateData = {
      verificationStatus: 'PENDING',
      requestedRole: validRequestedRole,
      rejectionReason: null, // clear previous rejection on resubmission
    };

    if (fullName && typeof fullName === 'string' && fullName.trim().length >= 2) {
      updateData.name = fullName.trim().slice(0, 80);
    }
    if (phone && typeof phone === 'string' && phone.trim()) {
      updateData.phone = phone.trim().slice(0, 20);
    }
    if (gender && typeof gender === 'string') {
      updateData.gender = gender.trim().slice(0, 30);
    }
    if (studentId && typeof studentId === 'string') {
      updateData.studentId = studentId.trim().slice(0, 50);
    }
    if (enrollmentNo && typeof enrollmentNo === 'string') {
      updateData.enrollmentNo = enrollmentNo.trim().slice(0, 50);
    }
    if (department && typeof department === 'string') {
      updateData.department = department.trim().slice(0, 80);
    }
    if (designation && typeof designation === 'string') {
      updateData.designation = designation.trim().slice(0, 80);
    }
    if (course && typeof course === 'string') {
      updateData.course = course.trim().slice(0, 50);
    }
    if (yearOrSemester && typeof yearOrSemester === 'string') {
      updateData.yearOrSemester = yearOrSemester.trim().slice(0, 50);
    }
    if (residencyType && typeof residencyType === 'string') {
      updateData.residencyType = residencyType.trim().slice(0, 30);
    }
    if (hostelName && typeof hostelName === 'string') {
      updateData.hostelName = hostelName.trim().slice(0, 80);
    }
    if (roomOrOffice && typeof roomOrOffice === 'string') {
      updateData.roomOrOffice = roomOrOffice.trim().slice(0, 80);
    }
    if (guardBadgeId && typeof guardBadgeId === 'string') {
      updateData.guardBadgeId = guardBadgeId.trim().slice(0, 50);
    }
    if (assignedZone && typeof assignedZone === 'string') {
      updateData.assignedZone = assignedZone.trim().slice(0, 80);
    }
    if (shift && typeof shift === 'string') {
      updateData.shift = shift.trim().slice(0, 30);
    }
    if (idProofUrl && typeof idProofUrl === 'string') {
      updateData.idProofUrl = idProofUrl.trim().slice(0, 255);
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: updateData,
    });

    // Optionally attach emergency contact if submitted together
    if (emergencyContact && emergencyContact.name && emergencyContact.phone) {
      const normalizedPhone = String(emergencyContact.phone).replace(/[^\d+]/g, '');
      if (normalizedPhone.length >= 7 && normalizedPhone.length <= 16) {
        await prisma.emergencyContact.create({
          data: {
            userId: req.user.id,
            name: String(emergencyContact.name).trim().slice(0, 80),
            phone: normalizedPhone,
            relation: emergencyContact.relation ? String(emergencyContact.relation).trim().slice(0, 40) : 'Emergency Guardian',
          },
        }).catch(() => {});
      }
    }

    // Record audit log
    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        action: 'VERIFICATION_SUBMITTED',
        targetId: req.user.id,
        targetType: 'USER',
        details: {
          requestedRole: validRequestedRole,
          department: updateData.department,
          studentId: updateData.studentId,
        },
      },
    }).catch(() => {});

    // Create confirmation in-app notification
    await prisma.notification.create({
      data: {
        userId: req.user.id,
        type: 'SYSTEM',
        title: 'Verification Request Received 📋',
        body: `Your credentials for the ${validRequestedRole} role have been submitted to College Administration for approval.`,
      },
    }).catch(() => {});

    res.status(200).json({
      success: true,
      data: {
        message: 'Verification details submitted successfully. Awaiting administrative review.',
        user: safeUser(updatedUser),
      },
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/auth/verification-status — authenticated
async function verificationStatusEndpoint(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });
    if (!user) throw unauthorized('User not found.', 'USER_NOT_FOUND');
    res.status(200).json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        requestedRole: user.requestedRole || user.role,
        verificationStatus: user.verificationStatus || (user.isVerified ? 'APPROVED' : 'UNVERIFIED'),
        gender: user.gender,
        department: user.department,
        designation: user.designation,
        studentId: user.studentId,
        enrollmentNo: user.enrollmentNo,
        course: user.course,
        yearOrSemester: user.yearOrSemester,
        residencyType: user.residencyType,
        hostelName: user.hostelName,
        roomOrOffice: user.roomOrOffice,
        guardBadgeId: user.guardBadgeId,
        assignedZone: user.assignedZone,
        shift: user.shift,
        rejectionReason: user.rejectionReason,
        reviewedBy: user.reviewedBy,
        reviewedAt: user.reviewedAt,
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified,
        isVerified: user.isVerified,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  changePassword,
  me,
  setupResponder,
  sendOtpEndpoint,
  verifyOtpEndpoint,
  verificationStatusEndpoint,
  submitVerification,
  safeUser,
};
