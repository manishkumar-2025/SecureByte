const { app, prisma, request, resetDb, registerAndLogin, createUser, loginToken } = require('./helpers');

describe('Campus Verification & Role-Based Permissions (Production RBAC)', () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  let studentToken, studentUser;
  let adminToken, adminUser;

  beforeEach(async () => {
    // Register a student requesting Faculty role
    const regRes = await request(app).post('/api/auth/register').send({
      name: 'Dr. Ramesh Sharma',
      email: 'ramesh.faculty@campus.edu',
      password: 'Passw0rd123',
      phone: '+919876543210',
      requestedRole: 'FACULTY',
    });
    expect(regRes.status).toBe(201);
    studentToken = regRes.body.data.accessToken;
    studentUser = regRes.body.data.user;

    // Create an Admin user
    adminUser = await createUser({
      name: 'Campus Director',
      email: 'director@campus.edu',
      password: 'AdminPassword123',
      role: 'ADMIN',
      isVerified: true,
    });
    adminToken = await loginToken('director@campus.edu', 'AdminPassword123');
  });

  describe('1. Account Registration & Requested Role', () => {
    test('public registration defaults to STUDENT role with requestedRole preserved', async () => {
      expect(studentUser.role).toBe('STUDENT');
      expect(studentUser.requestedRole).toBe('FACULTY');
      expect(studentUser.verificationStatus).toBeDefined();
    });

    test('public registration prevents self-assigning ADMIN or privileged roles', async () => {
      const hackRes = await request(app).post('/api/auth/register').send({
        name: 'Hacker User',
        email: 'hacker@campus.edu',
        password: 'Passw0rd123',
        requestedRole: 'ADMIN',
      });
      expect(hackRes.status).toBe(201);
      // Fallback to STUDENT as ADMIN cannot be self-requested
      expect(hackRes.body.data.user.role).toBe('STUDENT');
      expect(hackRes.body.data.user.requestedRole).toBe('STUDENT');
    });
  });

  describe('2. Verification Form Submission', () => {
    test('submits college credentials and moves to PENDING status', async () => {
      const verifRes = await request(app)
        .post('/api/auth/verification')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          fullName: 'Dr. Ramesh Sharma',
          phone: '+91 98765 43210',
          gender: 'MALE',
          requestedRole: 'FACULTY',
          department: 'Computer Science & Engineering',
          designation: 'Associate Professor',
          studentId: 'FAC-EMP-2024',
          roomOrOffice: 'Academic Complex Block B, Room 302',
          emergencyContact: {
            name: 'Sunita Sharma',
            phone: '+91 98111 22233',
            relation: 'Spouse',
          },
        });

      expect(verifRes.status).toBe(200);
      expect(verifRes.body.data.user.verificationStatus).toBe('PENDING');
      expect(verifRes.body.data.user.department).toBe('Computer Science & Engineering');
      expect(verifRes.body.data.user.designation).toBe('Associate Professor');
      expect(verifRes.body.data.user.studentId).toBe('FAC-EMP-2024');

      // Verify status endpoint returns the same
      const statusRes = await request(app)
        .get('/api/auth/verification')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(statusRes.status).toBe(200);
      expect(statusRes.body.data.verificationStatus).toBe('PENDING');
      expect(statusRes.body.data.studentId).toBe('FAC-EMP-2024');

      // Verify emergency contact was attached
      const contacts = await prisma.emergencyContact.findMany({ where: { userId: studentUser.id } });
      expect(contacts.length).toBeGreaterThanOrEqual(1);
      expect(contacts[0].name).toBe('Sunita Sharma');
    });
  });

  describe('3. Life-Safety Rule: SOS is NEVER blocked for unverified users', () => {
    test('unverified / pending user can trigger Emergency SOS without restriction', async () => {
      // Intentionally unverified
      await prisma.user.update({
        where: { id: studentUser.id },
        data: { isVerified: false, verificationStatus: 'PENDING' },
      });

      const sosRes = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          isSos: true,
          location: { campusLandmark: 'Hostel Circle Gate 3' },
        });

      expect(sosRes.status).toBe(201);
      expect(sosRes.body.data.incident.isSos).toBe(true);
      expect(sosRes.body.data.incident.priority).toBe('CRITICAL');
      // Flagged as unverified sender for urgent staff verification
      expect(sosRes.body.data.incident.title).toContain('[UNVERIFIED SENDER]');
    });
  });

  describe('4. Admin Verification Queue & Review', () => {
    beforeEach(async () => {
      // Submit verification first
      await request(app)
        .post('/api/auth/verification')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          requestedRole: 'FACULTY',
          department: 'Computer Science & Engineering',
          designation: 'Associate Professor',
          studentId: 'FAC-EMP-2024',
        });
    });

    test('admin can list verification queue; student is blocked (403)', async () => {
      const adminList = await request(app)
        .get('/api/admin/verifications?status=PENDING')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(adminList.status).toBe(200);
      expect(adminList.body.data.items.length).toBeGreaterThanOrEqual(1);
      expect(adminList.body.data.items.some((i) => i.id === studentUser.id)).toBe(true);

      // Student is blocked
      const studentBlock = await request(app)
        .get('/api/admin/verifications')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(studentBlock.status).toBe(403);
    });

    test('admin approves verification: unlocks role and creates audit trail', async () => {
      const reviewRes = await request(app)
        .post(`/api/admin/verifications/${studentUser.id}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          action: 'APPROVE',
          role: 'FACULTY',
          reviewerNotes: 'Verified against university faculty roster.',
        });

      expect(reviewRes.status).toBe(200);
      expect(reviewRes.body.data.user.role).toBe('FACULTY');
      expect(reviewRes.body.data.user.verificationStatus).toBe('APPROVED');

      // Verify in database
      const dbUser = await prisma.user.findUnique({ where: { id: studentUser.id } });
      expect(dbUser.role).toBe('FACULTY');
      expect(dbUser.isVerified).toBe(true);
      expect(dbUser.verificationStatus).toBe('APPROVED');

      // Verify user received notification
      const notifs = await prisma.notification.findMany({ where: { userId: studentUser.id } });
      expect(notifs.some((n) => n.title.includes('Approved'))).toBe(true);

      // Verify immutable audit log
      const audit = await prisma.auditLog.findFirst({
        where: { targetId: studentUser.id, action: 'VERIFICATION_APPROVE' },
      });
      expect(audit).toBeDefined();
      expect(audit.actorId).toBe(adminUser.id);
    });

    test('admin can request resubmission with reason', async () => {
      const reviewRes = await request(app)
        .post(`/api/admin/verifications/${studentUser.id}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          action: 'RESUBMIT',
          rejectionReason: 'ID card image was blurry. Please provide clear employee ID proof.',
        });

      expect(reviewRes.status).toBe(200);
      const dbUser = await prisma.user.findUnique({ where: { id: studentUser.id } });
      expect(dbUser.verificationStatus).toBe('RESUBMIT_REQUIRED');
      expect(dbUser.rejectionReason).toContain('blurry');
    });
  });

  describe('5. Role Assignment & Privileged Roles', () => {
    test('admin can promote a user to SENSITIVE_OFFICER or WARDEN', async () => {
      const promoteRes = await request(app)
        .patch(`/api/admin/users/${studentUser.id}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          role: 'SENSITIVE_OFFICER',
          designation: 'ICC Presiding Officer',
          department: 'Grievance Committee',
        });

      expect(promoteRes.status).toBe(200);
      expect(promoteRes.body.data.user.role).toBe('SENSITIVE_OFFICER');

      const dbUser = await prisma.user.findUnique({ where: { id: studentUser.id } });
      expect(dbUser.role).toBe('SENSITIVE_OFFICER');

      // Verify audit log exists
      const audit = await prisma.auditLog.findFirst({
        where: { targetId: studentUser.id, action: 'ROLE_PROMOTED' },
      });
      expect(audit).toBeDefined();
    });

    test('admin can view audit logs', async () => {
      const auditRes = await request(app)
        .get('/api/admin/audit-logs')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(auditRes.status).toBe(200);
      expect(auditRes.body.data.items).toBeDefined();
    });
  });
});
