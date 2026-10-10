const { app, prisma, request, resetDb, registerAndLogin } = require('./helpers');

describe('Access control (role-based authorization)', () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  let studentToken;
  let responderToken;
  let incidentId;

  beforeEach(async () => {
    ({ token: studentToken } = await registerAndLogin({ name: 'Aarav Rao', email: 'aarav@campus.edu', password: 'Passw0rd1' }));
    const responderRes = await request(app)
      .post('/api/auth/setup-responder')
      .send({ name: 'Safety Desk', email: 'desk@campus.edu', password: 'Passw0rd1', setupCode: 'jest-setup-code-99' });
    responderToken = responderRes.body.data.accessToken;

    const created = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ title: 'Access control test report', description: 'A report used to verify role-based access control.', category: 'OTHER' });
    incidentId = created.body.data.incident.id;
  });

  test('unauthenticated requests to protected routes get 401', async () => {
    expect((await request(app).post('/api/incidents').send({ isSos: true })).status).toBe(401);
    expect((await request(app).get('/api/incidents/my')).status).toBe(401);
    expect((await request(app).get('/api/responder/incidents')).status).toBe(401);
    expect((await request(app).get('/api/announcements')).status).toBe(401);
  });

  test('student is blocked from every responder-only route (403)', async () => {
    const queue = await request(app).get('/api/responder/incidents').set('Authorization', `Bearer ${studentToken}`);
    expect(queue.status).toBe(403);
    expect(queue.body.error.code).toBe('FORBIDDEN');

    const patch = await request(app)
      .patch(`/api/responder/incidents/${incidentId}/status`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ newStatus: 'ACKNOWLEDGED' });
    expect(patch.status).toBe(403);

    const announce = await request(app)
      .post('/api/responder/announcements')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ title: 'Fake announcement', message: 'A student should not be able to post announcements.' });
    expect(announce.status).toBe(403);
  });

  test('a student cannot self-promote: role claim in headers/body is ignored', async () => {
    // Even if the client lies about its role, middleware uses the DB record.
    const res = await request(app)
      .get('/api/responder/incidents')
      .set('Authorization', `Bearer ${studentToken}`)
      .set('X-Role', 'RESPONDER')
      .send({ role: 'RESPONDER' });
    expect(res.status).toBe(403);
  });

  test('responder can list the queue and sees the incident with reporter name', async () => {
    const res = await request(app).get('/api/responder/incidents').set('Authorization', `Bearer ${responderToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].reporter.name).toBe('Aarav Rao');
    expect(res.body.data.items[0].passwordHash).toBeUndefined();
  });

  test('responder filters work (status / priority / isSos)', async () => {
    const byStatus = await request(app)
      .get('/api/responder/incidents?status=NEW')
      .set('Authorization', `Bearer ${responderToken}`);
    expect(byStatus.body.data.items).toHaveLength(1);

    const byPriority = await request(app)
      .get('/api/responder/incidents?priority=CRITICAL')
      .set('Authorization', `Bearer ${responderToken}`);
    expect(byPriority.body.data.items).toHaveLength(0);

    const bySos = await request(app)
      .get('/api/responder/incidents?isSos=true')
      .set('Authorization', `Bearer ${responderToken}`);
    expect(bySos.body.data.items).toHaveLength(0);

    const badFilter = await request(app)
      .get('/api/responder/incidents?status=NOT_A_STATUS')
      .set('Authorization', `Bearer ${responderToken}`);
    expect(badFilter.status).toBe(422);
  });

  test('announcements: student reads, student cannot create, responder creates', async () => {
    const created = await request(app)
      .post('/api/responder/announcements')
      .set('Authorization', `Bearer ${responderToken}`)
      .send({ title: 'Storm warning', message: 'A thunderstorm warning is active until 6 PM today.', severity: 'WARNING' });
    expect(created.status).toBe(201);
    expect(created.body.data.announcement.severity).toBe('WARNING');

    const list = await request(app).get('/api/announcements').set('Authorization', `Bearer ${studentToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data.items).toHaveLength(1);
    expect(list.body.data.items[0].author.name).toBe('Safety Desk');
  });
});
