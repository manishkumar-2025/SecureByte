const { app, prisma, request, resetDb, registerAndLogin } = require('./helpers');

describe('Responder status updates & audit history', () => {
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
      .send({ title: 'Status lifecycle test report', description: 'A report used to verify the status lifecycle engine.', category: 'SECURITY_THREAT' });
    incidentId = created.body.data.incident.id;
  });

  async function patchStatus(newStatus, notes) {
    return request(app)
      .patch(`/api/responder/incidents/${incidentId}/status`)
      .set('Authorization', `Bearer ${responderToken}`)
      .send({ newStatus, responderNotes: notes });
  }

  test('full lifecycle NEW → ACKNOWLEDGED → IN_PROGRESS → RESOLVED with history rows', async () => {
    const ack = await patchStatus('ACKNOWLEDGED', 'Received. Safety team notified.');
    expect(ack.status).toBe(200);
    expect(ack.body.data.incident.status).toBe('ACKNOWLEDGED');

    const prog = await patchStatus('IN_PROGRESS', 'Two responders dispatched.');
    expect(prog.status).toBe(200);

    const done = await patchStatus('RESOLVED', 'Site secured and reported to campus admin.');
    expect(done.status).toBe(200);
    expect(done.body.data.incident.status).toBe('RESOLVED');

    const detail = await request(app).get(`/api/incidents/${incidentId}`).set('Authorization', `Bearer ${studentToken}`);
    const history = detail.body.data.incident.statusHistory;
    expect(history).toHaveLength(3);
    expect(history[0]).toMatchObject({ previousStatus: 'NEW', newStatus: 'ACKNOWLEDGED', responderNotes: 'Received. Safety team notified.' });
    expect(history[2]).toMatchObject({ previousStatus: 'IN_PROGRESS', newStatus: 'RESOLVED' });
    expect(history[0].updater.name).toBe('Safety Desk');
  });

  test('skipping steps is rejected (NEW → RESOLVED) with 409', async () => {
    const res = await patchStatus('RESOLVED', 'Trying to skip steps.');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    expect(res.body.error.details.allowedNextStatuses).toEqual(['ACKNOWLEDGED']);
  });

  test('same-status update is rejected', async () => {
    const res = await patchStatus('NEW', 'No-op attempt.');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });

  test('no further transition after RESOLVED', async () => {
    await patchStatus('ACKNOWLEDGED', 'step 1');
    await patchStatus('IN_PROGRESS', 'step 2');
    await patchStatus('RESOLVED', 'step 3');
    const res = await patchStatus('ACKNOWLEDGED', 'reopening attempt');
    expect(res.status).toBe(409);
  });

  test('student cannot change status even for their own incident (403)', async () => {
    const res = await request(app)
      .patch(`/api/responder/incidents/${incidentId}/status`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ newStatus: 'ACKNOWLEDGED' });
    expect(res.status).toBe(403);

    const detail = await request(app).get(`/api/incidents/${incidentId}`).set('Authorization', `Bearer ${studentToken}`);
    expect(detail.body.data.incident.status).toBe('NEW'); // unchanged
  });

  test('invalid status value → 422; unknown incident → 404', async () => {
    const bad = await request(app)
      .patch(`/api/responder/incidents/${incidentId}/status`)
      .set('Authorization', `Bearer ${responderToken}`)
      .send({ newStatus: 'MAGIC' });
    expect(bad.status).toBe(422);

    const missing = await request(app)
      .patch('/api/responder/incidents/00000000-0000-4000-8000-000000000000/status')
      .set('Authorization', `Bearer ${responderToken}`)
      .send({ newStatus: 'ACKNOWLEDGED' });
    expect(missing.status).toBe(404);
  });

  test('status update + audit history are transactional (both written together)', async () => {
    // Verify via direct DB inspection that a successful API call produced
    // exactly one incident row (status changed) AND one history row.
    await patchStatus('ACKNOWLEDGED', 'Transactional check.');

    const dbIncident = await prisma.incident.findUnique({ where: { id: incidentId } });
    const history = await prisma.incidentStatusHistory.findMany({ where: { incidentId } });

    expect(dbIncident.status).toBe('ACKNOWLEDGED');
    expect(history).toHaveLength(1);
    expect(history[0].updatedBy).toBeTruthy();
  });

  test('student sees the updated status through /incidents/my', async () => {
    await patchStatus('ACKNOWLEDGED', 'Visible to student.');
    const mine = await request(app).get('/api/incidents/my').set('Authorization', `Bearer ${studentToken}`);
    expect(mine.body.data.items[0].status).toBe('ACKNOWLEDGED');
  });
});
