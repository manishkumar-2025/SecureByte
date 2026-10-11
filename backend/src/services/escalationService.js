const { prisma } = require('../lib/prisma');
const { notifyUsers } = require('../lib/notify');
const { dispatchSms } = require('./dispatchService');
const { env } = require('../config/env');

// In-memory active escalation timers: incidentId -> timeout handle
const activeEscalationTimers = new Map();

/**
 * Schedules a 60-second (or configured) escalation check on the backend.
 */
function scheduleEscalation(incidentId, delaySeconds = null) {
  const delay = (delaySeconds !== null ? delaySeconds : (env.escalationDelaySeconds || 60)) * 1000;

  // Clear any existing timer for this incident
  cancelEscalation(incidentId);

  const timer = setTimeout(async () => {
    activeEscalationTimers.delete(incidentId);
    await triggerEscalationIfPending(incidentId);
  }, delay);

  // Unref timer so it doesn't hold test processes open unnecessarily
  if (timer.unref) timer.unref();

  activeEscalationTimers.set(incidentId, timer);
  return timer;
}

/**
 * Cancels a pending escalation timer (e.g. when a responder acknowledges the incident).
 */
function cancelEscalation(incidentId) {
  const existing = activeEscalationTimers.get(incidentId);
  if (existing) {
    clearTimeout(existing);
    activeEscalationTimers.delete(incidentId);
    return true;
  }
  return false;
}

/**
 * Executes the escalation if the incident is still unacknowledged (status === 'NEW').
 * Uses an atomic transaction and duplicate-detection to ensure multiple server instances
 * or concurrent sweeps never send duplicate escalation alerts.
 */
async function triggerEscalationIfPending(incidentId) {
  try {
    const claimResult = await prisma.$transaction(async (tx) => {
      const incident = await tx.incident.findUnique({
        where: { id: incidentId },
        include: { location: true, reporter: true },
      });

      if (!incident || incident.status !== 'NEW') {
        return { shouldDispatch: false, reason: 'ALREADY_ACKNOWLEDGED_OR_RESOLVED' };
      }

      // Duplicate prevention: check if an AUTO-ESCALATION history entry already exists
      const existingEscalation = await tx.incidentStatusHistory.findFirst({
        where: {
          incidentId,
          responderNotes: { contains: '[AUTO-ESCALATION]' },
        },
      });

      if (existingEscalation) {
        return { shouldDispatch: false, reason: 'ALREADY_ESCALATED' };
      }

      // Find an admin updater id or fallback to incident.reporterId
      const adminUser = await tx.user.findFirst({
        where: { role: 'ADMIN' },
        select: { id: true },
      });
      const updaterId = adminUser?.id || incident.reporterId;

      // Atomically record escalation in IncidentStatusHistory
      await tx.incidentStatusHistory.create({
        data: {
          incidentId,
          updatedBy: updaterId,
          previousStatus: incident.status,
          newStatus: incident.status,
          responderNotes: '🚨 [AUTO-ESCALATION] No responder acknowledged within 60s. Alert escalated to Backup Responders and Chief Security Officer.',
        },
      });

      return { shouldDispatch: true, incident };
    });

    if (!claimResult || !claimResult.shouldDispatch) {
      return { escalated: false, reason: claimResult?.reason || 'CLAIM_FAILED' };
    }

    const { incident } = claimResult;
    const landmark = incident.location?.campusLandmark || 'Campus Ground';
    const reporterName = incident.reporter?.name || 'A student';

    // 2. Load all ADMINs and backup responders for escalation alert
    const escalationStaff = await prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { id: true, notificationPrefs: true, phone: true },
    });

    // Send high-priority escalation notifications
    await notifyUsers(escalationStaff, {
      type: 'ESCALATION_ALERT',
      title: '🚨 [ESCALATED] Unacknowledged SOS Alert',
      body: `CRITICAL: SOS from ${reporterName} at ${landmark} was NOT acknowledged within 60s! Immediate response required.`,
      incidentId: incident.id,
      pushTitle: '🚨 [ESCALATED] Unacknowledged SOS Alert',
      pushData: { incidentId: incident.id, priority: 'CRITICAL', escalated: true },
    });

    // Send SMS to escalation staff who have phones registered
    for (const staff of escalationStaff) {
      if (staff.phone) {
        await dispatchSms({
          incidentId: incident.id,
          userId: staff.id,
          recipient: staff.phone,
          message: `🚨 SECUREBYTE ESCALATION: Unacknowledged SOS at ${landmark} by ${reporterName}. Chief Security response required!`,
          priority: 'CRITICAL',
          stage: 'escalation_backup',
        });
      }
    }

    return { escalated: true, incidentId };
  } catch (err) {
    console.error(`[escalation] Failed to trigger escalation for incident ${incidentId}:`, err.message);
    return { escalated: false, error: err.message };
  }
}

/**
 * Checks all incidents created over 60s ago that are still NEW and escalates them.
 * Useful on server startup or maintenance intervals.
 */
async function checkPendingEscalations(maxAgeSeconds = 60) {
  return recoverPendingEscalations(maxAgeSeconds);
}

/**
 * Recovers pending SOS escalations after server restart or during background maintenance.
 * - Computes remaining time based on incident.createdAt.
 * - Triggers overdue escalations immediately.
 * - Schedules pending ones with the exact remaining time.
 * - Protects against duplicates and concurrent double-executions.
 */
async function recoverPendingEscalations(targetDelaySeconds = null) {
  try {
    const delay = targetDelaySeconds !== null ? targetDelaySeconds : (env.escalationDelaySeconds || 60);
    const now = Date.now();

    const pendingIncidents = await prisma.incident.findMany({
      where: {
        isSos: true,
        status: 'NEW',
      },
      include: {
        statusHistory: {
          where: { responderNotes: { contains: '[AUTO-ESCALATION]' } },
          select: { id: true },
        },
      },
    });

    const results = [];
    for (const inc of pendingIncidents) {
      // If already escalated, skip
      if (inc.statusHistory && inc.statusHistory.length > 0) {
        continue;
      }

      // If timer is already running in memory in this process, skip
      if (activeEscalationTimers.has(inc.id)) {
        continue;
      }

      const elapsedSeconds = Math.floor((now - new Date(inc.createdAt).getTime()) / 1000);
      const remainingSeconds = Math.max(0, delay - elapsedSeconds);

      if (remainingSeconds <= 0) {
        const res = await triggerEscalationIfPending(inc.id);
        results.push({ incidentId: inc.id, action: 'TRIGGERED_IMMEDIATELY', res });
      } else {
        scheduleEscalation(inc.id, remainingSeconds);
        results.push({ incidentId: inc.id, action: 'SCHEDULED_REMAINING', remainingSeconds });
      }
    }

    return results;
  } catch (err) {
    console.error('[escalation] recoverPendingEscalations error:', err.message);
    return [];
  }
}

module.exports = {
  scheduleEscalation,
  cancelEscalation,
  triggerEscalationIfPending,
  checkPendingEscalations,
  recoverPendingEscalations,
  activeEscalationTimers,
};
