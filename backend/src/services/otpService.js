const crypto = require('crypto');
const { prisma } = require('../lib/prisma');
const { sendSms } = require('./smsService');
const { sendEmail } = require('./emailService');
const { badRequest, tooMany } = require('../utils/errors');
const { env } = require('../config/env');

function hashOtp(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function generateNumericOtp(length = 6) {
  // Cryptographically secure 6-digit number between 100000 and 999999
  const min = 10 ** (length - 1);
  const max = 10 ** length - 1;
  return String(crypto.randomInt(min, max + 1));
}

/**
 * Sends a verification OTP to the target (email or mobile) for the user.
 * Enforces resend cooldown and records the hashed OTP.
 */
async function sendOtp({ userId, channel, target }) {
  if (!target || typeof target !== 'string') {
    throw badRequest('A valid verification target (email or phone) is required.', 'INVALID_TARGET');
  }

  const now = new Date();
  const cooldownSeconds = env.otpCooldownSeconds || 60;
  const expiryMinutes = env.otpExpiryMinutes || 10;
  const maxAttempts = env.otpMaxAttempts || 5;

  // Check existing active OTP for cooldown
  const latestOtp = await prisma.verificationOtp.findFirst({
    where: { userId, channel },
    orderBy: { createdAt: 'desc' },
  });

  if (latestOtp && latestOtp.resendAfter > now && !latestOtp.verifiedAt) {
    const remainingSeconds = Math.ceil((latestOtp.resendAfter.getTime() - now.getTime()) / 1000);
    throw tooMany(
      `Please wait ${remainingSeconds} second(s) before requesting another verification code.`,
      'RESEND_COOLDOWN',
      { remainingSeconds }
    );
  }

  const code = generateNumericOtp(6);
  const codeHash = hashOtp(code);
  const expiresAt = new Date(now.getTime() + expiryMinutes * 60 * 1000);
  const resendAfter = new Date(now.getTime() + cooldownSeconds * 1000);

  // Invalidate any unverified active OTPs for this user & channel
  await prisma.verificationOtp.updateMany({
    where: { userId, channel, verifiedAt: null },
    data: { verifiedAt: new Date(0) }, // marked stale
  });

  const otpRecord = await prisma.verificationOtp.create({
    data: {
      userId,
      channel,
      target,
      codeHash,
      attempts: 0,
      maxAttempts,
      expiresAt,
      resendAfter,
    },
  });

  // Transmit through the requested channel
  if (channel === 'EMAIL') {
    await sendEmail({
      to: target,
      subject: 'SecureByte — Your Verification Code',
      text: `Your SecureByte verification code is: ${code}\nThis code expires in ${expiryMinutes} minutes. Do not share this code with anyone.`,
    });
  } else if (channel === 'SMS') {
    await sendSms({
      to: target,
      message: `Your SecureByte verification code is ${code}. Expires in ${expiryMinutes} minutes.`,
    });
  }

  return {
    success: true,
    otpId: otpRecord.id,
    channel,
    target,
    expiresAt,
    resendAfter,
    // Return code in test environment for deterministic assertions
    ...(process.env.NODE_ENV === 'test' ? { testCode: code } : {}),
  };
}

/**
 * Verifies an OTP code for a user and channel.
 * Increments attempt counter on failure, invalidates when max attempts reached.
 */
async function verifyOtp({ userId, channel, code }) {
  if (!code || typeof code !== 'string') {
    throw badRequest('Verification code is required.', 'INVALID_CODE');
  }

  const now = new Date();
  const maxAttempts = env.otpMaxAttempts || 5;

  const record = await prisma.verificationOtp.findFirst({
    where: { userId, channel, verifiedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  if (!record || record.expiresAt < now) {
    throw badRequest('Verification code has expired or is invalid. Please request a new code.', 'EXPIRED_CODE');
  }

  if (record.attempts >= record.maxAttempts) {
    throw badRequest('Maximum verification attempts exceeded. Please request a new code.', 'MAX_ATTEMPTS_EXCEEDED');
  }

  const givenHash = hashOtp(code.trim());
  if (record.codeHash !== givenHash) {
    const nextAttempts = record.attempts + 1;
    await prisma.verificationOtp.update({
      where: { id: record.id },
      data: { attempts: nextAttempts },
    });
    const remaining = Math.max(0, record.maxAttempts - nextAttempts);
    throw badRequest(
      remaining > 0
        ? `Incorrect verification code. ${remaining} attempt(s) remaining.`
        : 'Maximum attempts exceeded. Please request a new verification code.',
      'INVALID_CODE',
      { remainingAttempts: remaining }
    );
  }

  // Code matches! Mark verified
  await prisma.verificationOtp.update({
    where: { id: record.id },
    data: { verifiedAt: now },
  });

  // Update user verification status
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw badRequest('User not found.', 'USER_NOT_FOUND');

  const updateData = {};
  if (channel === 'EMAIL') {
    updateData.emailVerified = true;
  } else if (channel === 'SMS') {
    updateData.phoneVerified = true;
    updateData.phone = record.target;
  }

  // Check if both are now satisfied
  const willBeEmailVerified = channel === 'EMAIL' ? true : user.emailVerified;
  const willBePhoneVerified = channel === 'SMS' ? true : user.phoneVerified;

  // Fully verified when both email and phone are verified (or if only email was provided/configured)
  updateData.isVerified = Boolean(willBeEmailVerified && (user.phone ? willBePhoneVerified : willBePhoneVerified || true));

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: updateData,
  });

  return {
    success: true,
    channel,
    isVerified: updatedUser.isVerified,
    emailVerified: updatedUser.emailVerified,
    phoneVerified: updatedUser.phoneVerified,
  };
}

module.exports = {
  sendOtp,
  verifyOtp,
  hashOtp,
  generateNumericOtp,
};
