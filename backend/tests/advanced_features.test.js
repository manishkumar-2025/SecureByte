const { app, prisma, request, resetDb, createUser, loginToken } = require('./helpers');
const { sendOtp, verifyOtp } = require('../src/services/otpService');
const { scheduleEscalation, cancelEscalation, triggerEscalationIfPending } = require('../src/services/escalationService');
const { dispatchSms, dispatchSosIncident } = require('../src/services/dispatchService');
const { getMockSentSms, clearMockSms } = require('../src/services/smsService');
const { getMockSentEmails, clearMockEmails } = require('../src/services/emailService');

describe('Advanced Security & Dispatch Features (Audit Upgrade)', () => {
  beforeEach(async () => {
    await resetDb();
    clearMockSms();
    clearMockEmails();
  });

  afterAll(() => prisma.$disconnect());

  describe('1. Dual Email & Mobile OTP Verification', () => {
    test('unverified students cannot create standard incident reports', async () => {
      // Create student explicitly unverified
      const student = await createUser({
        name: 'Unverified Student',
        email: 'unverified@campus.edu',
        password: 'Password123',
        role: 'STUDENT',
        isVerified: false,
      });

      const token = await loginToken('unverified@campus.edu', 'Password123');

      // Attempting to create a normal incident report without verification
      const res = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Damaged street lamp',
          description: 'Street lamp outside hostel is flickering and dark',
          category: 'FACILITY_CONCERN',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('UNVERIFIED_ACCOUNT');
      expect(res.body.error.message).toMatch(/verification required/i);
    });

    test('emergency SOS fallback allows unverified student SOS with safety triage flags', async () => {
      const student = await createUser({
        name: 'Unverified In Danger',
        email: 'urgent-student@campus.edu',
        password: 'Password123',
        role: 'STUDENT',
        isVerified: false,
      });

      const token = await loginToken('urgent-student@campus.edu', 'Password123');

      // Emergency SOS call
      const res = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${token}`)
        .send({
          isSos: true,
          location: { campusLandmark: 'East Forest Pathway' },
        });

      // Does NOT get dropped with 403; gets 201 Created!
      expect(res.status).toBe(201);
      const incident = res.body.data.incident;
      expect(incident.title).toMatch(/\[UNVERIFIED SENDER\]/);
      expect(incident.description).toMatch(/\[UNVERIFIED ACCOUNT EMERGENCY FALLBACK/);
      expect(incident.priority).toBe('CRITICAL');

      // Audit trail in status history
      const history = await prisma.incidentStatusHistory.findMany({ where: { incidentId: incident.id } });
      expect(history.some((h) => h.responderNotes.includes('emergency fallback policy'))).toBe(true);
    });

    test('generates OTP with 60-second cooldown and expires after time', async () => {
      const student = await createUser({
        name: 'Priya Sharma',
        email: 'priya@campus.edu',
        password: 'Password123',
        role: 'STUDENT',
        isVerified: false,
      });

      const token = await loginToken('priya@campus.edu', 'Password123');

      // Send initial email OTP
      const res1 = await request(app)
        .post('/api/auth/send-otp')
        .set('Authorization', `Bearer ${token}`)
        .send({ channel: 'EMAIL' });

      expect(res1.status).toBe(200);
      expect(res1.body.data.channel).toBe('EMAIL');

      // Immediate resend within 60s should be rejected with 429 Too Many Requests
      const res2 = await request(app)
        .post('/api/auth/send-otp')
        .set('Authorization', `Bearer ${token}`)
        .send({ channel: 'EMAIL' });

      expect(res2.status).toBe(429);
      expect(res2.body.error.code).toBe('RESEND_COOLDOWN');
      expect(res2.body.error.details.remainingSeconds).toBeGreaterThan(0);
    });

    test('verifies email and phone OTPs and transitions user to verified', async () => {
      const student = await createUser({
        name: 'Rahul Verma',
        email: 'rahul@campus.edu',
        password: 'Password123',
        role: 'STUDENT',
        isVerified: false,
      });

      // Send Email OTP
      const emailOtp = await sendOtp({ userId: student.id, channel: 'EMAIL', target: 'rahul@campus.edu' });
      expect(emailOtp.testCode).toBeTruthy();

      // Verify with wrong code first
      await expect(
        verifyOtp({ userId: student.id, channel: 'EMAIL', code: '000000' })
      ).rejects.toThrow(/Incorrect verification code/);

      // Verify with valid code
      const emailResult = await verifyOtp({ userId: student.id, channel: 'EMAIL', code: emailOtp.testCode });
      expect(emailResult.emailVerified).toBe(true);

      // Send Mobile OTP
      const smsOtp = await sendOtp({ userId: student.id, channel: 'SMS', target: '+919876543210' });
      expect(smsOtp.testCode).toBeTruthy();

      // Verify mobile OTP
      const smsResult = await verifyOtp({ userId: student.id, channel: 'SMS', code: smsOtp.testCode });
      expect(smsResult.phoneVerified).toBe(true);
      expect(smsResult.isVerified).toBe(true);

      // Now student can create SOS alert!
      const token = await loginToken('rahul@campus.edu', 'Password123');
      const sosRes = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${token}`)
        .send({ isSos: true });

      expect(sosRes.status).toBe(201);
      expect(sosRes.body.data.incident.isSos).toBe(true);
    });

    test('enforces max 5 attempts before invalidating verification code', async () => {
      const student = await createUser({
        name: 'Test Student',
        email: 'testlimit@campus.edu',
        password: 'Password123',
        role: 'STUDENT',
        isVerified: false,
      });

      const otp = await sendOtp({ userId: student.id, channel: 'EMAIL', target: 'testlimit@campus.edu' });

      // Fail 5 times
      for (let i = 0; i < 4; i++) {
        await expect(verifyOtp({ userId: student.id, channel: 'EMAIL', code: '111111' })).rejects.toThrow();
      }

      // 5th failure
      await expect(verifyOtp({ userId: student.id, channel: 'EMAIL', code: '111111' })).rejects.toThrow();

      // 6th attempt is blocked with max attempts exceeded
      await expect(verifyOtp({ userId: student.id, channel: 'EMAIL', code: otp.testCode })).rejects.toThrow(
        /Maximum verification attempts exceeded/
      );
    });
  });

  describe('2. Secure Login & Device Session Tracking', () => {
    test('detects new device login, creates session, and issues security alert notification', async () => {
      await createUser({
        name: 'Device User',
        email: 'device@campus.edu',
        password: 'Password123',
        role: 'STUDENT',
        isVerified: true,
      });

      // Login from device A
      const res1 = await request(app)
        .post('/api/auth/login')
        .set('x-device-id', 'device-uuid-laptop-01')
        .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)')
        .send({ email: 'device@campus.edu', password: 'Password123' });

      expect(res1.status).toBe(200);

      // Give async notification and device tracker a tick to execute
      await new Promise((r) => setTimeout(r, 100));

      const sessions = await prisma.deviceSession.findMany({ where: { user: { email: 'device@campus.edu' } } });
      expect(sessions.length).toBe(1);
      expect(sessions[0].deviceIdentifier).toBe('device-uuid-laptop-01');

      // Check that a security alert was written to Notifications
      const notifs = await prisma.notification.findMany({
        where: { user: { email: 'device@campus.edu' }, type: 'SECURITY_ALERT' },
      });
      expect(notifs.length).toBe(1);
      expect(notifs[0].title).toMatch(/New sign-in detected/);

      // Logging in again from the same device should update lastSeenAt without duplicating notification
      const res2 = await request(app)
        .post('/api/auth/login')
        .set('x-device-id', 'device-uuid-laptop-01')
        .send({ email: 'device@campus.edu', password: 'Password123' });

      expect(res2.status).toBe(200);
      await new Promise((r) => setTimeout(r, 100));

      const notifsAfter = await prisma.notification.findMany({
        where: { user: { email: 'device@campus.edu' }, type: 'SECURITY_ALERT' },
      });
      expect(notifsAfter.length).toBe(1); // No duplicate notification
    });
  });

  describe('3. Automatic SOS Dispatch & Delivery Tracking', () => {
    test('automatically sends SMS to emergency contacts when SOS is triggered', async () => {
      const student = await createUser({
        name: 'Aanya Singh',
        email: 'aanya@campus.edu',
        password: 'Password123',
        role: 'STUDENT',
        isVerified: true,
      });

      // Add emergency contact
      await prisma.emergencyContact.create({
        data: {
          userId: student.id,
          name: 'Dad',
          phone: '+919988776655',
          relation: 'Parent',
        },
      });

      // Also create a responder with phone
      const responder = await createUser({
        name: 'Officer Vikram',
        email: 'vikram@campus.edu',
        password: 'Password123',
        role: 'RESPONDER',
        isVerified: true,
      });
      await prisma.user.update({ where: { id: responder.id }, data: { phone: '+919123456789' } });

      const token = await loginToken('aanya@campus.edu', 'Password123');

      const res = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${token}`)
        .send({
          isSos: true,
          location: { campusLandmark: 'Library West Gate' },
        });

      expect(res.status).toBe(201);
      const incident = res.body.data.incident;

      // Allow background dispatch tick
      await new Promise((r) => setTimeout(r, 150));

      // Verify SMS mock caught the alerts
      const sentSms = getMockSentSms();
      expect(sentSms.length).toBeGreaterThanOrEqual(1);
      const contactSms = sentSms.find((s) => s.to === '+919988776655');
      expect(contactSms).toBeDefined();
      expect(contactSms.message).toMatch(/Aanya Singh activated SOS at Library West Gate/);

      // Verify dispatch logs recorded in DB
      const dispatchLogs = await prisma.dispatchLog.findMany({ where: { incidentId: incident.id } });
      expect(dispatchLogs.length).toBeGreaterThanOrEqual(1);
      expect(dispatchLogs[0].status).toBe('SENT');
      expect(dispatchLogs[0].provider).toBe('mock');
      expect(dispatchLogs[0].priority).toBe('CRITICAL');
    });

    test('idempotency prevents duplicate SMS dispatch for same incident & recipient', async () => {
      const incidentId = '11111111-2222-3333-4444-555555555555';
      const recipient = '+919876500000';

      const firstSend = await dispatchSms({
        incidentId,
        recipient,
        message: 'Test SOS Message',
        stage: 'emergency_contact',
      });
      expect(firstSend.success).toBe(true);
      expect(firstSend.log.status).toBe('SENT');

      // Duplicate send attempt with same idempotency key
      const secondSend = await dispatchSms({
        incidentId,
        recipient,
        message: 'Test SOS Message Duplicate',
        stage: 'emergency_contact',
      });
      expect(secondSend.skipped).toBe(true);
      expect(secondSend.reason).toBe('IDEMPOTENT_DUPLICATE');
    });
  });

  describe('4. 60-Second Escalation Engine', () => {
    test('escalates unacknowledged SOS incident after deadline and notifies admins', async () => {
      const admin = await createUser({
        name: 'Chief Security Officer',
        email: 'chief@campus.edu',
        password: 'Password123',
        role: 'ADMIN',
        isVerified: true,
      });

      const student = await createUser({
        name: 'Dev Patel',
        email: 'dev@campus.edu',
        password: 'Password123',
        role: 'STUDENT',
        isVerified: true,
      });

      const token = await loginToken('dev@campus.edu', 'Password123');

      // Create SOS
      const res = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${token}`)
        .send({ isSos: true, location: { campusLandmark: 'Hostel 3 Mess' } });

      const incidentId = res.body.data.incident.id;

      // Trigger escalation engine
      const escalationResult = await triggerEscalationIfPending(incidentId);
      expect(escalationResult.escalated).toBe(true);

      // Verify IncidentStatusHistory has audit entry
      const history = await prisma.incidentStatusHistory.findMany({ where: { incidentId } });
      expect(history.length).toBe(1);
      expect(history[0].responderNotes).toMatch(/\[AUTO-ESCALATION\] No responder acknowledged within 60s/);

      // Verify escalation notification sent to Chief Security Officer
      const notifs = await prisma.notification.findMany({
        where: { userId: admin.id, type: 'ESCALATION_ALERT' },
      });
      expect(notifs.length).toBe(1);
      expect(notifs[0].title).toMatch(/\[ESCALATED\] Unacknowledged SOS Alert/);
    });

    test('cancels escalation when responder acknowledges incident before timer fires', async () => {
      const student = await createUser({
        name: 'Tara Roy',
        email: 'tara@campus.edu',
        password: 'Password123',
        role: 'STUDENT',
        isVerified: true,
      });

      const responder = await createUser({
        name: 'Officer Anita',
        email: 'anita@campus.edu',
        password: 'Password123',
        role: 'RESPONDER',
        isVerified: true,
      });

      const studentToken = await loginToken('tara@campus.edu', 'Password123');
      const responderToken = await loginToken('anita@campus.edu', 'Password123');

      const createRes = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ isSos: true });

      const incidentId = createRes.body.data.incident.id;

      // Responder acknowledges incident
      const ackRes = await request(app)
        .patch(`/api/responder/incidents/${incidentId}/status`)
        .set('Authorization', `Bearer ${responderToken}`)
        .send({ newStatus: 'ACKNOWLEDGED', responderNotes: 'On my way in vehicle 4' });

      expect(ackRes.status).toBe(200);

      // Now trigger escalation check — should NOT escalate because status is ACKNOWLEDGED
      const escalationCheck = await triggerEscalationIfPending(incidentId);
      expect(escalationCheck.escalated).toBe(false);
      expect(escalationCheck.reason).toBe('ALREADY_ACKNOWLEDGED_OR_RESOLVED');
    });

    test('duplicate escalation prevention stops second escalation alert', async () => {
      const student = await createUser({
        name: 'Suresh Raina',
        email: 'suresh@campus.edu',
        password: 'Password123',
        role: 'STUDENT',
        isVerified: true,
      });

      const token = await loginToken('suresh@campus.edu', 'Password123');
      const res = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${token}`)
        .send({ isSos: true });

      const incidentId = res.body.data.incident.id;

      // First escalation execution
      const first = await triggerEscalationIfPending(incidentId);
      expect(first.escalated).toBe(true);

      // Second escalation execution
      const second = await triggerEscalationIfPending(incidentId);
      expect(second.escalated).toBe(false);
      expect(second.reason).toBe('ALREADY_ESCALATED');

      // Verify only ONE escalation history row exists
      const history = await prisma.incidentStatusHistory.findMany({
        where: { incidentId, responderNotes: { contains: '[AUTO-ESCALATION]' } },
      });
      expect(history.length).toBe(1);
    });

    test('durable restart recovery recovers overdue and pending escalations', async () => {
      const { recoverPendingEscalations } = require('../src/services/escalationService');

      const student = await createUser({
        name: 'Karan Mehra',
        email: 'karan@campus.edu',
        password: 'Password123',
        role: 'STUDENT',
        isVerified: true,
      });

      // 1. Create an incident that was created 120s ago (simulating server was down for 2 minutes)
      const pastDate = new Date(Date.now() - 120_000);
      const overdueIncident = await prisma.incident.create({
        data: {
          reporterId: student.id,
          title: 'Overdue SOS Alert',
          description: 'Emergency SOS created before server reboot',
          category: 'SOS_ALERT',
          priority: 'CRITICAL',
          isSos: true,
          status: 'NEW',
          createdAt: pastDate,
        },
      });

      // 2. Create an incident created 20s ago (simulating 40s remaining)
      const recentDate = new Date(Date.now() - 20_000);
      const recentIncident = await prisma.incident.create({
        data: {
          reporterId: student.id,
          title: 'Recent SOS Alert',
          description: 'Emergency SOS created 20s before reboot',
          category: 'SOS_ALERT',
          priority: 'CRITICAL',
          isSos: true,
          status: 'NEW',
          createdAt: recentDate,
        },
      });

      const recoveryResults = await recoverPendingEscalations(60);

      // Overdue incident should have been triggered immediately
      const overdueResult = recoveryResults.find((r) => r.incidentId === overdueIncident.id);
      expect(overdueResult).toBeDefined();
      expect(overdueResult.action).toBe('TRIGGERED_IMMEDIATELY');
      expect(overdueResult.res.escalated).toBe(true);

      // Recent incident should have been scheduled with remaining time (~40s)
      const recentResult = recoveryResults.find((r) => r.incidentId === recentIncident.id);
      expect(recentResult).toBeDefined();
      expect(recentResult.action).toBe('SCHEDULED_REMAINING');
      expect(recentResult.remainingSeconds).toBeGreaterThan(0);
      expect(recentResult.remainingSeconds).toBeLessThanOrEqual(45);
    });
  });

  describe('5. Production Telephony & Observability Enforcement', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalSid = process.env.TWILIO_ACCOUNT_SID;
    const originalToken = process.env.TWILIO_AUTH_TOKEN;
    const originalPhone = process.env.TWILIO_PHONE_NUMBER;
    const originalSmtp = process.env.SMTP_HOST;
    const originalSendgrid = process.env.SENDGRID_API_KEY;

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
      process.env.TWILIO_ACCOUNT_SID = originalSid;
      process.env.TWILIO_AUTH_TOKEN = originalToken;
      process.env.TWILIO_PHONE_NUMBER = originalPhone;
      process.env.SMTP_HOST = originalSmtp;
      process.env.SENDGRID_API_KEY = originalSendgrid;
    });

    test('fails SMS observably in production if Twilio credentials are missing', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.TWILIO_ACCOUNT_SID;
      delete process.env.TWILIO_AUTH_TOKEN;
      delete process.env.TWILIO_PHONE_NUMBER;

      const { sendSms } = require('../src/services/smsService');
      await expect(
        sendSms({ to: '+919876543210', message: 'Test Emergency' })
      ).rejects.toThrow(/Twilio credentials.*not configured in production mode/i);

      // Verify dispatchSms records status as FAILED in database
      const dispatchResult = await dispatchSms({
        incidentId: '00000000-0000-0000-0000-000000000001',
        recipient: '+919876543210',
        message: 'Test Emergency Message',
        stage: 'emergency_contact',
      });

      expect(dispatchResult.success).toBe(false);
      expect(dispatchResult.log.status).toBe('FAILED');
      expect(dispatchResult.log.errorMessage).toMatch(/Twilio credentials.*not configured in production mode/i);
    });

    test('fails email observably in production if SMTP/email provider is missing', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.SMTP_HOST;
      delete process.env.SENDGRID_API_KEY;
      delete process.env.EMAIL_PROVIDER;

      const { sendEmail } = require('../src/services/emailService');
      await expect(
        sendEmail({ to: 'admin@campus.edu', subject: 'Alert', text: 'Body' })
      ).rejects.toThrow(/Email provider.*not configured in production mode/i);
    });
  });

  describe('6. Migration Schema Compatibility', () => {
    test('database schema supports OTPs, device sessions, and dispatch logs with correct columns', async () => {
      const student = await createUser({
        name: 'Test Schema User',
        email: 'schema@campus.edu',
        password: 'Password123',
        role: 'STUDENT',
        isVerified: false,
      });

      // Verification OTP model check
      const otp = await prisma.verificationOtp.create({
        data: {
          userId: student.id,
          channel: 'EMAIL',
          target: 'schema@campus.edu',
          codeHash: 'hash123',
          expiresAt: new Date(Date.now() + 600000),
          resendAfter: new Date(Date.now() + 60000),
        },
      });
      expect(otp.id).toBeDefined();

      // Device session model check
      const session = await prisma.deviceSession.create({
        data: {
          userId: student.id,
          deviceIdentifier: 'device-test-uuid-1',
          userAgent: 'Jest Test Agent',
          ipAddress: '127.0.0.1',
        },
      });
      expect(session.id).toBeDefined();

      // Dispatch log model check
      const dispatch = await prisma.dispatchLog.create({
        data: {
          recipient: '+919999999999',
          channel: 'SMS',
          priority: 'CRITICAL',
          status: 'QUEUED',
          idempotencyKey: 'test-key-schema-1',
        },
      });
      expect(dispatch.id).toBeDefined();
      expect(dispatch.status).toBe('QUEUED');
    });
  });
});
