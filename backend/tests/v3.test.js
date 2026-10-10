// ─────────────────────────────────────────────────────────────
// SecureByte v3 — tests for the premium-feature backend:
//   • emergency contacts (CRUD, cap, ownership)
//   • safety check-ins (SAFE / NEEDS_HELP + staff notification)
//   • safety points directory + geo filtering
//   • in-app notification center (list, unread count, mark read)
//   • notification preferences
//   • analytics (responder/admin)
//   • admin user directory + RBAC
//   • photo evidence upload (multer)
// ─────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const { app, prisma, request, resetDb, registerAndLogin, createUser } = require('./helpers');

async function loginAs(email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${JSON.stringify(res.body)}`);
  return res.body.data.accessToken;
}

async function createStaffToken({ email, role }) {
  await createUser({ name: 'Staff User', email, password: 'Passw0rd1', role });
  return loginAs(email, 'Passw0rd1');
}

function makeJpegBuffer() {
  // Minimal valid JPEG (1×1 px). Keeps the test light — multer only needs
  // the declared MIME type to pass its filter.
  return Buffer.from(
    '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwcJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
    'base64'
  );
}

describe('Emergency contacts', () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  let token;
  beforeEach(async () => {
    ({ token } = await registerAndLogin({ name: 'Contact Owner', email: 'owner@campus.edu', password: 'Passw0rd1' }));
  });

  test('create, list, update, delete own contact', async () => {
    const created = await request(app)
      .post('/api/contacts')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Mom', phone: '+91 98765 43210', relation: 'Family' });
    expect(created.status).toBe(201);
    expect(created.body.data.contact.phone).toBe('+919876543210'); // normalized

    const list = await request(app).get('/api/contacts').set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.data.items).toHaveLength(1);

    const id = created.body.data.contact.id;
    const updated = await request(app)
      .patch(`/api/contacts/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Mom (Mobile)' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.contact.name).toBe('Mom (Mobile)');

    const deleted = await request(app).delete(`/api/contacts/${id}`).set('Authorization', `Bearer ${token}`);
    expect(deleted.status).toBe(200);
    const after = await request(app).get('/api/contacts').set('Authorization', `Bearer ${token}`);
    expect(after.body.data.items).toHaveLength(0);
  });

  test('rejects invalid phone numbers with 422', async () => {
    const res = await request(app)
      .post('/api/contacts')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Bad Number', phone: '123' }); // too short
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('enforces the 5-contact cap', async () => {
    for (let i = 0; i < 5; i++) {
      const ok = await request(app)
        .post('/api/contacts')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `Contact ${i}`, phone: '9876543210' });
      expect(ok.status).toBe(201);
    }
    const sixth = await request(app)
      .post('/api/contacts')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'One Too Many', phone: '9876543211' });
    expect(sixth.status).toBe(422);
    expect(sixth.body.error.code).toBe('CONTACT_LIMIT_REACHED');
  });

  test('users cannot see or modify another user\'s contacts (404, no existence leak)', async () => {
    const other = await createUser({ name: 'Other User', email: 'other@campus.edu', password: 'Passw0rd1' });
    const otherContact = await prisma.emergencyContact.create({
      data: { userId: other.id, name: 'Secret', phone: '9111111111' },
    });

    const list = await request(app).get('/api/contacts').set('Authorization', `Bearer ${token}`);
    expect(list.body.data.items).toHaveLength(0);

    const patch = await request(app)
      .patch(`/api/contacts/${otherContact.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Hacked' });
    expect(patch.status).toBe(404);

    const del = await request(app).delete(`/api/contacts/${otherContact.id}`).set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(404);

    const stillThere = await prisma.emergencyContact.findUnique({ where: { id: otherContact.id } });
    expect(stillThere.name).toBe('Secret');
  });

  test('unauthenticated access is rejected with 401', async () => {
    expect((await request(app).get('/api/contacts')).status).toBe(401);
    expect((await request(app).post('/api/contacts').send({ name: 'X', phone: '9876543210' })).status).toBe(401);
  });
});

describe('Safety check-ins', () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  let studentToken;
  let responderToken;
  beforeEach(async () => {
    ({ token: studentToken } = await registerAndLogin({ name: 'Checkin Student', email: 'ci@campus.edu', password: 'Passw0rd1' }));
    responderToken = await createStaffToken({ email: 'ci-staff@campus.edu', role: 'RESPONDER' });
  });

  test('student can check in SAFE and sees own history', async () => {
    const res = await request(app)
      .post('/api/checkins')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ status: 'SAFE', note: 'In library, all good' });
    expect(res.status).toBe(201);
    expect(res.body.data.checkIn.status).toBe('SAFE');

    const mine = await request(app).get('/api/checkins/me').set('Authorization', `Bearer ${studentToken}`);
    expect(mine.status).toBe(200);
    expect(mine.body.data.items).toHaveLength(1);
    expect(mine.body.data.items[0].note).toBe('In library, all good');
  });

  test('NEEDS_HELP check-in creates notifications for safety staff', async () => {
    const res = await request(app)
      .post('/api/checkins')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ status: 'NEEDS_HELP', note: 'Dizzy, near hostel gate' });
    expect(res.status).toBe(201);

    // give the fire-and-forget notify a beat
    await new Promise((r) => setTimeout(r, 150));

    const staffNotifications = await prisma.notification.findMany({ where: { type: 'CHECK_IN_ALERT' } });
    expect(staffNotifications.length).toBeGreaterThanOrEqual(1);
    expect(staffNotifications[0].body).toContain('NEEDS HELP');
  });

  test('rejects invalid status and bad coordinates', async () => {
    const bad = await request(app)
      .post('/api/checkins')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ status: 'MAYBE' });
    expect(bad.status).toBe(422);

    const badCoords = await request(app)
      .post('/api/checkins')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ status: 'SAFE', latitude: 999, longitude: 0 });
    expect(badCoords.status).toBe(422);
  });

  test('staff view requires staff role and returns summary counters', async () => {
    await request(app).post('/api/checkins').set('Authorization', `Bearer ${studentToken}`).send({ status: 'SAFE' });

    const blocked = await request(app).get('/api/responder/checkins').set('Authorization', `Bearer ${studentToken}`);
    expect(blocked.status).toBe(403);

    const ok = await request(app).get('/api/responder/checkins').set('Authorization', `Bearer ${responderToken}`);
    expect(ok.status).toBe(200);
    expect(ok.body.data.summary).toBeDefined();
    expect(ok.body.data.items[0].user.name).toBe('Checkin Student');
  });
});

describe('Safety points (campus map data)', () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  let token;
  beforeEach(async () => {
    ({ token } = await registerAndLogin({ name: 'Mapper', email: 'map@campus.edu', password: 'Passw0rd1' }));
    await prisma.safetyPoint.createMany({
      data: [
        { name: 'A Exit', category: 'EMERGENCY_EXIT', latitude: 23.8100, longitude: 86.4300 },
        { name: 'B AED', category: 'AED', latitude: 23.8150, longitude: 86.4350 },
        { name: 'C Office', category: 'SECURITY_OFFICE', latitude: 23.8200, longitude: 86.4400 },
      ],
    });
  });

  test('lists all points for authenticated users', async () => {
    const res = await request(app).get('/api/safety-points').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(3);
  });

  test('filters by category', async () => {
    const res = await request(app)
      .get('/api/safety-points?category=AED')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.items[0].name).toBe('B AED');
  });

  test('rejects invalid category with 422', async () => {
    const res = await request(app)
      .get('/api/safety-points?category=SAUNA')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(422);
  });

  test('geo query sorts nearest-first and honours radius', async () => {
    const near = await request(app)
      .get('/api/safety-points?lat=23.8149&lng=86.4351&radius=1000')
      .set('Authorization', `Bearer ${token}`);
    expect(near.status).toBe(200);
    expect(near.body.data.items[0].name).toBe('B AED'); // nearest first
    expect(near.body.data.items[0].distanceMeters).toBeDefined();

    const tiny = await request(app)
      .get('/api/safety-points?lat=23.9000&lng=86.5000&radius=50')
      .set('Authorization', `Bearer ${token}`);
    expect(tiny.body.data.total).toBe(0); // query point is far from every seeded point

    const invalid = await request(app)
      .get('/api/safety-points?lat=999&lng=86.43')
      .set('Authorization', `Bearer ${token}`);
    // invalid coordinates are ignored → falls back to unsorted full list
    expect(invalid.status).toBe(200);
    expect(invalid.body.data.total).toBe(3);
  });

  test('unauthenticated access is rejected with 401', async () => {
    expect((await request(app).get('/api/safety-points')).status).toBe(401);
  });
});

describe('Notification center', () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  let studentToken;
  let responderToken;
  let studentId;
  beforeEach(async () => {
    ({ token: studentToken, user: studentUser } = await registerAndLogin({ name: 'Notif User', email: 'notif@campus.edu', password: 'Passw0rd1' }));
    studentId = studentUser.id;
    responderToken = await createStaffToken({ email: 'notif-staff@campus.edu', role: 'RESPONDER' });
  });

  test('new SOS writes notification rows for staff (in-app center works without push)', async () => {
    await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ isSos: true });
    await new Promise((r) => setTimeout(r, 150));

    const rows = await prisma.notification.findMany({ where: { type: 'SOS_ALERT' } });
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test('unread count, mark one read, mark all read', async () => {
    await prisma.notification.createMany({
      data: [
        { userId: studentId, type: 'SYSTEM', title: 'Welcome', body: 'b1' },
        { userId: studentId, type: 'SYSTEM', title: 'Second', body: 'b2' },
      ],
    });

    const count1 = await request(app).get('/api/notifications/unread-count').set('Authorization', `Bearer ${studentToken}`);
    expect(count1.body.data.count).toBe(2);

    const list = await request(app).get('/api/notifications').set('Authorization', `Bearer ${studentToken}`);
    expect(list.body.data.items).toHaveLength(2);
    expect(list.body.data.unreadCount).toBe(2);

    const firstId = list.body.data.items[0].id;
    const marked = await request(app).patch(`/api/notifications/${firstId}/read`).set('Authorization', `Bearer ${studentToken}`);
    expect(marked.status).toBe(200);
    expect(marked.body.data.notification.readAt).not.toBeNull();

    const count2 = await request(app).get('/api/notifications/unread-count').set('Authorization', `Bearer ${studentToken}`);
    expect(count2.body.data.count).toBe(1);

    const all = await request(app).post('/api/notifications/read-all').set('Authorization', `Bearer ${studentToken}`);
    expect(all.status).toBe(200);
    expect(all.body.data.updated).toBe(1);

    const count3 = await request(app).get('/api/notifications/unread-count').set('Authorization', `Bearer ${studentToken}`);
    expect(count3.body.data.count).toBe(0);
  });

  test('users cannot read another user\'s notification', async () => {
    const other = await createUser({ name: 'Other Notif', email: 'notif2@campus.edu', password: 'Passw0rd1' });
    const row = await prisma.notification.create({
      data: { userId: other.id, type: 'SYSTEM', title: 'Private', body: 'x' },
    });
    const res = await request(app).patch(`/api/notifications/${row.id}/read`).set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(404);
  });

  test('status update writes STATUS_UPDATE notification for the reporter', async () => {
    const created = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ title: 'Notification flow report', description: 'Used to verify status-change notifications.', category: 'OTHER' });
    const incidentId = created.body.data.incident.id;

    await request(app)
      .patch(`/api/responder/incidents/${incidentId}/status`)
      .set('Authorization', `Bearer ${responderToken}`)
      .send({ newStatus: 'ACKNOWLEDGED' });
    await new Promise((r) => setTimeout(r, 150));

    const rows = await prisma.notification.findMany({ where: { userId: studentId, type: 'STATUS_UPDATE' } });
    expect(rows).toHaveLength(1);
    expect(rows[0].incidentId).toBe(incidentId);
  });
});

describe('Notification preferences', () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  let token;
  beforeEach(async () => {
    ({ token } = await registerAndLogin({ name: 'Prefs User', email: 'prefs@campus.edu', password: 'Passw0rd1' }));
  });

  test('returns defaults for a new user', async () => {
    const res = await request(app).get('/api/me/preferences').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.preferences).toEqual({ push: true, sosAlerts: true, statusUpdates: true, announcements: true });
  });

  test('partial update persists and validation rejects junk', async () => {
    const ok = await request(app)
      .put('/api/me/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({ preferences: { announcements: false } });
    expect(ok.status).toBe(200);
    expect(ok.body.data.preferences.announcements).toBe(false);
    expect(ok.body.data.preferences.push).toBe(true); // untouched

    const unknown = await request(app)
      .put('/api/me/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({ preferences: { spamMe: true } });
    expect(unknown.status).toBe(422);

    const wrongType = await request(app)
      .put('/api/me/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({ preferences: { push: 'yes' } });
    expect(wrongType.status).toBe(422);
  });

  test('disabled sosAlerts stops push audience selection but rows are still written', async () => {
    // staff turns off SOS push
    await request(app)
      .put('/api/me/preferences')
      .set('Authorization', `Bearer ${await createStaffToken({ email: 'prefs-staff@campus.edu', role: 'RESPONDER' })}`)
      .send({ preferences: { sosAlerts: false } });

    const staff = await prisma.user.findUnique({ where: { email: 'prefs-staff@campus.edu' } });

    await request(app).post('/api/incidents').set('Authorization', `Bearer ${token}`).send({ isSos: true });
    await new Promise((r) => setTimeout(r, 150));

    const rows = await prisma.notification.findMany({ where: { userId: staff.id, type: 'SOS_ALERT' } });
    // The in-app record is ALWAYS written — only the push is gated.
    expect(rows).toHaveLength(1);
  });
});

describe('Analytics & admin directory', () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  let studentToken;
  let responderToken;
  let adminToken;
  beforeEach(async () => {
    ({ token: studentToken } = await registerAndLogin({ name: 'Analyst Student', email: 'an@campus.edu', password: 'Passw0rd1' }));
    responderToken = await createStaffToken({ email: 'an-staff@campus.edu', role: 'RESPONDER' });
    adminToken = await createStaffToken({ email: 'an-admin@campus.edu', role: 'ADMIN' });
  });

  test('responder and admin can read analytics; student gets 403', async () => {
    await request(app).post('/api/incidents').set('Authorization', `Bearer ${studentToken}`).send({ isSos: true });

    const asResponder = await request(app).get('/api/responder/analytics').set('Authorization', `Bearer ${responderToken}`);
    expect(asResponder.status).toBe(200);
    expect(asResponder.body.data.totals.incidents).toBe(1);
    expect(asResponder.body.data.series7d).toHaveLength(7);
    expect(asResponder.body.data.byCategory.SOS_ALERT).toBe(1);
    expect(asResponder.body.data.checkInsLast24h).toBeDefined();

    const asAdmin = await request(app).get('/api/responder/analytics').set('Authorization', `Bearer ${adminToken}`);
    expect(asAdmin.status).toBe(200);

    const blocked = await request(app).get('/api/responder/analytics').set('Authorization', `Bearer ${studentToken}`);
    expect(blocked.status).toBe(403);
  });

  test('avg resolution time is computed from real resolved incidents', async () => {
    const created = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ title: 'Resolution timing report', description: 'Will be resolved to compute avg resolution.', category: 'OTHER' });
    const id = created.body.data.incident.id;
    await request(app).patch(`/api/responder/incidents/${id}/status`).set('Authorization', `Bearer ${responderToken}`).send({ newStatus: 'ACKNOWLEDGED' });
    await request(app).patch(`/api/responder/incidents/${id}/status`).set('Authorization', `Bearer ${responderToken}`).send({ newStatus: 'IN_PROGRESS' });
    await request(app).patch(`/api/responder/incidents/${id}/status`).set('Authorization', `Bearer ${responderToken}`).send({ newStatus: 'RESOLVED' });

    const res = await request(app).get('/api/responder/analytics').set('Authorization', `Bearer ${responderToken}`);
    expect(res.body.data.avgResolutionMinutes).not.toBeNull();
    expect(res.body.data.avgResolutionMinutes).toBeGreaterThanOrEqual(0);
    expect(res.body.data.byStatus.RESOLVED).toBe(1);
  });

  test('admin user directory works; responder and student are blocked', async () => {
    const ok = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${adminToken}`);
    expect(ok.status).toBe(200);
    expect(ok.body.data.items.length).toBeGreaterThanOrEqual(3);
    // sensitive fields must never be present
    ok.body.data.items.forEach((u) => {
      expect(u.passwordHash).toBeUndefined();
      expect(u.notificationPrefs).toBeUndefined();
    });

    expect((await request(app).get('/api/admin/users').set('Authorization', `Bearer ${responderToken}`)).status).toBe(403);
    expect((await request(app).get('/api/admin/users').set('Authorization', `Bearer ${studentToken}`)).status).toBe(403);
    expect((await request(app).get('/api/admin/users')).status).toBe(401);
  });

  test('admin directory supports role filter and search', async () => {
    const admins = await request(app).get('/api/admin/users?role=ADMIN').set('Authorization', `Bearer ${adminToken}`);
    expect(admins.body.data.items.every((u) => u.role === 'ADMIN')).toBe(true);

    const search = await request(app)
      .get('/api/admin/users')
      .query({ q: 'analyst' })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(search.status).toBe(200);
    expect(search.body.data.pagination.total).toBe(1);
    expect(search.body.data.items[0].email).toBe('an@campus.edu');
  });
});

describe('Photo evidence upload', () => {
  beforeEach(resetDb);
  afterAll(() => {
    // clean any files created during tests
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    if (fs.existsSync(uploadsDir)) fs.rmSync(uploadsDir, { recursive: true, force: true });
    prisma.$disconnect();
  });

  let token;
  let otherToken;
  let incidentId;
  beforeEach(async () => {
    ({ token } = await registerAndLogin({ name: 'Photo Owner', email: 'photo@campus.edu', password: 'Passw0rd1' }));
    ({ token: otherToken } = await registerAndLogin({ name: 'Photo Other', email: 'photo2@campus.edu', password: 'Passw0rd1' }));
    const created = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Photo evidence report', description: 'A report used to verify photo uploads.', category: 'OTHER' });
    incidentId = created.body.data.incident.id;
  });

  test('owner can attach a JPEG; path is stored and file lands on disk', async () => {
    const res = await request(app)
      .post(`/api/incidents/${incidentId}/photo`)
      .set('Authorization', `Bearer ${token}`)
      .attach('photo', makeJpegBuffer(), { filename: 'evidence.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(200);
    expect(res.body.data.incident.photoPath).toMatch(/^\/uploads\/[0-9a-f-]+\.jpg$/);

    const stored = path.join(__dirname, '..', res.body.data.incident.photoPath);
    expect(fs.existsSync(stored)).toBe(true);
  });

  test('non-owner cannot attach a photo (403)', async () => {
    const res = await request(app)
      .post(`/api/incidents/${incidentId}/photo`)
      .set('Authorization', `Bearer ${otherToken}`)
      .attach('photo', makeJpegBuffer(), { filename: 'evidence.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(403);
  });

  test('non-image content is rejected with 422', async () => {
    const res = await request(app)
      .post(`/api/incidents/${incidentId}/photo`)
      .set('Authorization', `Bearer ${token}`)
      .attach('photo', Buffer.from('definitely not an image'), { filename: 'evil.txt', contentType: 'text/plain' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_PHOTO_TYPE');
  });

  test('missing file is rejected; delete removes the photo', async () => {
    const noFile = await request(app).post(`/api/incidents/${incidentId}/photo`).set('Authorization', `Bearer ${token}`);
    expect(noFile.status).toBe(422);

    await request(app)
      .post(`/api/incidents/${incidentId}/photo`)
      .set('Authorization', `Bearer ${token}`)
      .attach('photo', makeJpegBuffer(), { filename: 'e.jpg', contentType: 'image/jpeg' });

    const del = await request(app).delete(`/api/incidents/${incidentId}/photo`).set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);
    expect(del.body.data.incident.photoPath).toBeNull();

    const secondDelete = await request(app).delete(`/api/incidents/${incidentId}/photo`).set('Authorization', `Bearer ${token}`);
    expect(secondDelete.status).toBe(422); // nothing left to delete
  });
});
