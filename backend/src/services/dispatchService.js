const { prisma } = require('../lib/prisma');
const { sendSms } = require('./smsService');
const { sendToUsers } = require('../lib/push');

/**
 * Dispatches an SMS alert with idempotency protection and audit logging.
 */
async function dispatchSms({ incidentId, userId = null, recipient, message, priority = 'CRITICAL', stage = 'initial' }) {
  if (!recipient) return null;

  const idempotencyKey = `${incidentId || 'sys'}:SMS:${recipient}:${stage}`;

  // Check if already dispatched under this idempotency key
  const existing = await prisma.dispatchLog.findUnique({
    where: { idempotencyKey },
  });

  if (existing && ['SENT', 'DELIVERED'].includes(existing.status)) {
    return { skipped: true, reason: 'IDEMPOTENT_DUPLICATE', log: existing };
  }

  // Create or upsert QUEUED dispatch log
  const log = await prisma.dispatchLog.upsert({
    where: { idempotencyKey },
    create: {
      incidentId,
      userId,
      recipient,
      channel: 'SMS',
      priority,
      status: 'QUEUED',
      idempotencyKey,
      attempts: 1,
    },
    update: {
      attempts: { increment: 1 },
      status: 'QUEUED',
    },
  });

  try {
    const sendResult = await sendSms({ to: recipient, message });
    const updated = await prisma.dispatchLog.update({
      where: { id: log.id },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        provider: sendResult.provider,
        providerRef: sendResult.messageId,
        responsePayload: sendResult,
      },
    });
    return { success: true, log: updated };
  } catch (err) {
    const failedLog = await prisma.dispatchLog.update({
      where: { id: log.id },
      data: {
        status: 'FAILED',
        errorMessage: err.message,
      },
    });
    return { success: false, error: err.message, log: failedLog };
  }
}

/**
 * Automatically dispatches SOS alerts across multiple channels (SMS to emergency contacts and responders).
 */
async function dispatchSosIncident({ incident, reporter, contacts = [] }) {
  const incidentId = incident.id;
  const landmark = incident.location?.campusLandmark || incident.location?.buildingOrRoom || 'Campus Ground';
  const reporterName = reporter?.name || 'A student';
  const reporterPhone = reporter?.phone || 'Not registered';

  const alertMessage = `🚨 SECUREBYTE EMERGENCY SOS: ${reporterName} activated SOS at ${landmark}. Phone: ${reporterPhone}. Check campus command center immediately!`;

  const results = {
    contactsNotified: 0,
    respondersNotified: 0,
    dispatches: [],
  };

  // 1. Notify emergency contacts via SMS
  for (const contact of contacts) {
    if (contact.phone) {
      const dispatchResult = await dispatchSms({
        incidentId,
        userId: contact.userId,
        recipient: contact.phone,
        message: alertMessage,
        priority: 'CRITICAL',
        stage: 'emergency_contact',
      });
      if (dispatchResult?.success) results.contactsNotified++;
      results.dispatches.push(dispatchResult);
    }
  }

  // 2. Fetch responders with phone numbers and notify via SMS
  const responders = await prisma.user.findMany({
    where: {
      role: { in: ['RESPONDER', 'ADMIN'] },
      phone: { not: null },
    },
    select: { id: true, phone: true, name: true },
  });

  for (const responder of responders) {
    if (responder.phone) {
      const dispatchResult = await dispatchSms({
        incidentId,
        userId: responder.id,
        recipient: responder.phone,
        message: `🚨 RESPONDER ALERT: SOS reported by ${reporterName} at ${landmark}. Incident ID: ${incidentId.slice(0, 8)}.`,
        priority: 'CRITICAL',
        stage: 'responder_sms',
      });
      if (dispatchResult?.success) results.respondersNotified++;
      results.dispatches.push(dispatchResult);
    }
  }

  return results;
}

/**
 * Acknowledges a dispatch log (called when responder interacts).
 */
async function acknowledgeDispatch(incidentId, userId) {
  return prisma.dispatchLog.updateMany({
    where: { incidentId, status: { in: ['SENT', 'DELIVERED'] } },
    data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date() },
  });
}

module.exports = {
  dispatchSms,
  dispatchSosIncident,
  acknowledgeDispatch,
};
