const { app, prisma, request, resetDb, registerAndLogin } = require('./helpers');

describe('Incident creation & retrieval', () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  let studentToken;

  beforeEach(async () => {
    ({ token: studentToken } = await registerAndLogin({
      name: 'Aarav Rao',
      email: 'aarav@campus.edu',
      password: 'Passw0rd1',
    }));
  });

  test('creates an incident with defaults (NEW / MEDIUM) and unique id', async () => {
    const res = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        title: 'Broken window in Lab 4',
        description: 'A large window pane in Lab 4 is shattered and students pass right next to it.',
        category: 'FACILITY_CONCERN',
      });

    expect(res.status).toBe(201);
    const { incident } = res.body.data;
    expect(incident.status).toBe('NEW');
    expect(incident.priority).toBe('MEDIUM');
    expect(incident.isSos).toBe(false);
    expect(incident.id).toMatch(/[0-9a-f-]{36}/i);
    expect(incident.createdAt).toBeTruthy();
    expect(incident.reporterId).toBeDefined();
  });

  test('SOS alerts are forced to CRITICAL priority + SOS_ALERT category', async () => {
    const res = await request(app).post('/api/incidents').set('Authorization', `Bearer ${studentToken}`).send({ isSos: true });

    expect(res.status).toBe(201);
    const { incident } = res.body.data;
    expect(incident.isSos).toBe(true);
    expect(incident.category).toBe('SOS_ALERT');
    expect(incident.priority).toBe('CRITICAL');
    expect(incident.status).toBe('NEW');
  });

  test('clients cannot set CRITICAL priority on a normal report (reserved for SOS)', async () => {
    const res = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ title: 'Suspicious visitor at gate', description: 'A stranger is arguing with the guard at the main gate.', category: 'SECURITY_THREAT', priority: 'CRITICAL' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('rejects invalid category, short title, missing description with 422', async () => {
    const base = { title: 'Valid title here', description: 'A description long enough to pass validation rules.' };

    const badCategory = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ ...base, category: 'ALIEN_INVASION' });
    expect(badCategory.status).toBe(422);

    const shortTitle = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ ...base, title: 'Hi', category: 'OTHER' });
    expect(shortTitle.status).toBe(422);

    const shortDesc = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ title: 'Valid title here', description: 'short', category: 'OTHER' });
    expect(shortDesc.status).toBe(422);
  });

  test('stores location when provided and validates coordinate ranges', async () => {
    const good = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        title: 'Slippery staircase in Block C',
        description: 'Water is leaking onto the staircase and it is very slippery in the morning rush.',
        category: 'FACILITY_CONCERN',
        location: { latitude: 23.8103, longitude: 86.4304, campusLandmark: 'Block C staircase' },
      });
    expect(good.status).toBe(201);
    expect(good.body.data.incident.location.latitude).toBeCloseTo(23.8103);
    expect(good.body.data.incident.location.campusLandmark).toBe('Block C staircase');

    const badCoords = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        title: 'Bad coordinates test',
        description: 'This report should be rejected because latitude is out of the valid range.',
        category: 'OTHER',
        location: { latitude: 200, longitude: 86 },
      });
    expect(badCoords.status).toBe(422);

    const onlyLat = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        title: 'Half coordinates test',
        description: 'This report has only latitude and no longitude which must be rejected.',
        category: 'OTHER',
        location: { latitude: 23.8 },
      });
    expect(onlyLat.status).toBe(422);
  });

  test('duplicate submission within the window returns 409 with the existing id', async () => {
    const payload = {
      title: 'Someone fainted near canteen',
      description: 'A student just fainted near the canteen entrance and needs help right now.',
      category: 'MEDICAL_EMERGENCY',
    };

    const first = await request(app).post('/api/incidents').set('Authorization', `Bearer ${studentToken}`).send(payload);
    expect(first.status).toBe(201);

    const second = await request(app).post('/api/incidents').set('Authorization', `Bearer ${studentToken}`).send(payload);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('DUPLICATE_SUBMISSION');
    expect(second.body.error.details.existingIncidentId).toBe(first.body.data.incident.id);
  });

  test('GET /my returns only the caller’s incidents', async () => {
    await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ title: 'Aarav report one', description: 'First report created by Aarav for the my-reports check.', category: 'OTHER' });

    const { token: otherToken } = await registerAndLogin({ name: 'Priya S', email: 'priya@campus.edu', password: 'Passw0rd1' });
    await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ title: 'Priya report one', description: 'First report created by Priya for the my-reports check.', category: 'OTHER' });

    const mine = await request(app).get('/api/incidents/my').set('Authorization', `Bearer ${studentToken}`);
    expect(mine.status).toBe(200);
    expect(mine.body.data.items).toHaveLength(1);
    expect(mine.body.data.items[0].title).toBe('Aarav report one');
    expect(mine.body.data.pagination.total).toBe(1);
  });

  test('owner can view, other student gets 403, responder gets 200, unknown id 404', async () => {
    const created = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ title: 'Owner visibility test', description: 'A report used to verify per-incident access control rules.', category: 'OTHER' });
    const id = created.body.data.incident.id;

    const owner = await request(app).get(`/api/incidents/${id}`).set('Authorization', `Bearer ${studentToken}`);
    expect(owner.status).toBe(200);

    const { token: otherToken } = await registerAndLogin({ name: 'Priya S', email: 'priya@campus.edu', password: 'Passw0rd1' });
    const stranger = await request(app).get(`/api/incidents/${id}`).set('Authorization', `Bearer ${otherToken}`);
    expect(stranger.status).toBe(403);

    // responder sees it (created via setup-responder with the test code)
    const responder = await request(app)
      .post('/api/auth/setup-responder')
      .send({ name: 'Desk', email: 'desk@campus.edu', password: 'Passw0rd1', setupCode: 'jest-setup-code-99' });
    const responderView = await request(app).get(`/api/incidents/${id}`).set('Authorization', `Bearer ${responder.body.data.accessToken}`);
    expect(responderView.status).toBe(200);

    const missing = await request(app)
      .get('/api/incidents/00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('INCIDENT_NOT_FOUND');
  });

  describe('PATCH /api/incidents/:id (Owner Edit)', () => {
    test('owner can edit title, description, and category while status is NEW', async () => {
      const created = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ title: 'Initial Draft Report', description: 'Detailed initial draft report description here.', category: 'OTHER' });
      const id = created.body.data.incident.id;

      const editRes = await request(app)
        .patch(`/api/incidents/${id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          title: 'Corrected Title Report',
          description: 'Updated report description with more accurate details.',
          category: 'FACILITY_CONCERN',
        });

      expect(editRes.status).toBe(200);
      expect(editRes.body.success).toBe(true);
      expect(editRes.body.data.incident.title).toBe('Corrected Title Report');
      expect(editRes.body.data.incident.description).toBe('Updated report description with more accurate details.');
      expect(editRes.body.data.incident.category).toBe('FACILITY_CONCERN');
    });

    test('stranger cannot edit another student incident (403 NOT_YOUR_INCIDENT)', async () => {
      const created = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ title: 'Student A Report', description: 'Incident filed by Student A for unauthorized edit test.', category: 'OTHER' });
      const id = created.body.data.incident.id;

      const { token: otherToken } = await registerAndLogin({ name: 'Other Guy', email: 'otherguy@campus.edu', password: 'Passw0rd1' });
      const editRes = await request(app)
        .patch(`/api/incidents/${id}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ title: 'Hacked Title By Stranger' });

      expect(editRes.status).toBe(403);
      expect(editRes.body.error.code).toBe('NOT_YOUR_INCIDENT');
    });

    test('cannot edit emergency SOS alert (422 SOS_EDIT_FORBIDDEN)', async () => {
      const sosRes = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ isSos: true, location: { latitude: 23.6547, longitude: 86.4737, campusLandmark: 'Main Gate' } });
      const id = sosRes.body.data.incident.id;

      const editRes = await request(app)
        .patch(`/api/incidents/${id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ title: 'Attempted to edit SOS' });

      expect(editRes.status).toBe(422);
      expect(editRes.body.error.code).toBe('SOS_EDIT_FORBIDDEN');
    });

    test('cannot edit after responder acknowledges or updates status (422 INCIDENT_ALREADY_ACKNOWLEDGED)', async () => {
      const created = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ title: 'Report To Be Acknowledged', description: 'Testing post-acknowledgement immutable rule.', category: 'OTHER' });
      const id = created.body.data.incident.id;

      // Responder acknowledges
      const responder = await request(app)
        .post('/api/auth/setup-responder')
        .send({ name: 'AckDesk', email: 'ackdesk@campus.edu', password: 'Passw0rd1', setupCode: 'jest-setup-code-99' });
      await request(app)
        .patch(`/api/responder/incidents/${id}/status`)
        .set('Authorization', `Bearer ${responder.body.data.accessToken}`)
        .send({ newStatus: 'ACKNOWLEDGED' });

      // Owner attempts edit
      const editRes = await request(app)
        .patch(`/api/incidents/${id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ title: 'Attempt edit acknowledged incident' });

      expect(editRes.status).toBe(422);
      expect(editRes.body.error.code).toBe('INCIDENT_ALREADY_ACKNOWLEDGED');
    });

    test('returns 422 if no changes provided or invalid fields', async () => {
      const created = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ title: 'Validation Target Report', description: 'Report to check patch validation rules.', category: 'OTHER' });
      const id = created.body.data.incident.id;

      const emptyRes = await request(app)
        .patch(`/api/incidents/${id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({});
      expect(emptyRes.status).toBe(422);
      expect(emptyRes.body.error.code).toBe('NO_CHANGES');

      const shortTitle = await request(app)
        .patch(`/api/incidents/${id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ title: 'Hi' });
      expect(shortTitle.status).toBe(422);

      const invalidCategory = await request(app)
        .patch(`/api/incidents/${id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ category: 'NON_EXISTENT_CATEGORY' });
      expect(invalidCategory.status).toBe(422);
      expect(invalidCategory.body.error.code).toBe('INVALID_CATEGORY');
    });
  });
});

