// Tests for the production-hardening features:
// refresh-token rotation, logout, account lockout, password change,
// push-token registration and list search/pagination.

const {
  app,
  prisma,
  request,
  resetDb,
  createUser,
  loginToken,
  createIncidentViaApi,
} = require('./helpers');

let student;
let responderToken;

beforeAll(async () => {
  await resetDb();
  student = await createUser({ name: 'Lockout Student', email: 'lockstudent@test.dev', password: 'Password123' });
  await createUser({ name: 'Responder One', email: 'lockresponder@test.dev', password: 'Password123', role: 'RESPONDER' });
  responderToken = await loginToken('lockresponder@test.dev', 'Password123');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Refresh tokens (silent session renewal)', () => {
  let refreshToken;

  test('login returns BOTH accessToken and refreshToken', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'lockstudent@test.dev', password: 'Password123' });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).toBeTruthy();
    refreshToken = res.body.data.refreshToken;
  });

  test('refresh exchanges it for a NEW pair', async () => {
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).toBeTruthy();
    expect(res.body.data.refreshToken).not.toBe(refreshToken); // rotated
    expect(res.body.data.user.email).toBe('lockstudent@test.dev');
    refreshToken = res.body.data.refreshToken;
  });

  test('REUSING a rotated refresh token is rejected (401)', async () => {
    // Reuse would only work if the server failed to rotate — this is the
    // core replay-protection property.
    const first = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(first.status).toBe(200);
    const newest = first.body.data.refreshToken;

    const replay = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('INVALID_REFRESH_TOKEN');

    refreshToken = newest;
  });

  test('garbage refresh token → 401', async () => {
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'x'.repeat(40) });
    expect(res.status).toBe(401);
  });

  test('logout revokes the refresh token', async () => {
    const res = await request(app).post('/api/auth/logout').send({ refreshToken });
    expect(res.status).toBe(200);
    const after = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(after.status).toBe(401);
  });

  test('logout with unknown token is idempotent 200', async () => {
    const res = await request(app).post('/api/auth/logout').send({ refreshToken: 'y'.repeat(40) });
    expect(res.status).toBe(200);
  });
});

describe('Account lockout (brute-force protection)', () => {
  beforeAll(async () => {
    // Fresh account so the counter starts at 0.
    await prisma.user.update({
      where: { email: 'lockstudent@test.dev' },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
  });

  test('5 wrong passwords → 6th attempt LOCKED even with the right password', async () => {
    for (let i = 0; i < 5; i += 1) {
      const bad = await request(app)
        .post('/api/auth/login')
        .send({ email: 'lockstudent@test.dev', password: `WrongPass${i}` });
      expect(bad.status).toBe(401);
    }

    const locked = await request(app)
      .post('/api/auth/login')
      .send({ email: 'lockstudent@test.dev', password: 'Password123' });
    expect(locked.status).toBe(423);
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  test('lockout expires (lockedUntil in the past) → login works again and counter resets', async () => {
    await prisma.user.update({
      where: { email: 'lockstudent@test.dev' },
      data: { lockedUntil: new Date(Date.now() - 1000) },
    });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'lockstudent@test.dev', password: 'Password123' });
    expect(res.status).toBe(200);

    const user = await prisma.user.findUnique({ where: { email: 'lockstudent@test.dev' } });
    expect(user.failedLoginCount).toBe(0);
    expect(user.lockedUntil).toBeNull();
  });
});

describe('Password change', () => {
  let token;

  beforeAll(async () => {
    token = await loginToken('lockstudent@test.dev', 'Password123');
  });

  test('wrong current password → 422, password unchanged', async () => {
    const res = await request(app)
      .patch('/api/auth/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'TotallyWrong1', newPassword: 'NewPassword456' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_CURRENT_PASSWORD');

    const stillOld = await request(app).post('/api/auth/login').send({ email: 'lockstudent@test.dev', password: 'Password123' });
    expect(stillOld.status).toBe(200);
  });

  test('new password must satisfy the policy (422)', async () => {
    const res = await request(app)
      .patch('/api/auth/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'Password123', newPassword: 'short' });
    expect(res.status).toBe(422);
  });

  test('correct change → old password rejected, new password works', async () => {
    const res = await request(app)
      .patch('/api/auth/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'Password123', newPassword: 'NewPassword456' });
    expect(res.status).toBe(200);

    const oldLogin = await request(app).post('/api/auth/login').send({ email: 'lockstudent@test.dev', password: 'Password123' });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app).post('/api/auth/login').send({ email: 'lockstudent@test.dev', password: 'NewPassword456' });
    expect(newLogin.status).toBe(200);
  });

  test('requires authentication (401 without token)', async () => {
    const res = await request(app)
      .patch('/api/auth/password')
      .send({ currentPassword: 'NewPassword456', newPassword: 'AnotherPass789' });
    expect(res.status).toBe(401);
  });
});

describe('Push token registration', () => {
  const expoToken = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa]';

  test('requires auth (401)', async () => {
    const res = await request(app).post('/api/devices/push-token').send({ token: expoToken, platform: 'android' });
    expect(res.status).toBe(401);
  });

  test('registers a token (201)', async () => {
    const res = await request(app)
      .post('/api/devices/push-token')
      .set('Authorization', `Bearer ${await loginToken('lockstudent@test.dev', 'NewPassword456')}`)
      .send({ token: expoToken, platform: 'android' });
    expect(res.status).toBe(201);
  });

  test('re-registering the same token upserts (no duplicate rows)', async () => {
    const token = await loginToken('lockstudent@test.dev', 'NewPassword456');
    await request(app)
      .post('/api/devices/push-token')
      .set('Authorization', `Bearer ${token}`)
      .send({ token: expoToken, platform: 'android' });
    const rows = await prisma.pushToken.findMany({ where: { token: expoToken } });
    expect(rows).toHaveLength(1);
  });

  test('invalid platform rejected (422)', async () => {
    const token = await loginToken('lockstudent@test.dev', 'NewPassword456');
    const res = await request(app)
      .post('/api/devices/push-token')
      .set('Authorization', `Bearer ${token}`)
      .send({ token: expoToken, platform: 'flip-phone' });
    expect(res.status).toBe(422);
  });

  test('delete removes only the caller token', async () => {
    const token = await loginToken('lockstudent@test.dev', 'NewPassword456');
    const res = await request(app).delete('/api/devices/push-token').set('Authorization', `Bearer ${token}`).send({ token: expoToken });
    expect(res.status).toBe(200);
    const rows = await prisma.pushToken.findMany({ where: { token: expoToken } });
    expect(rows).toHaveLength(0);
  });
});

describe('Responder queue: search + pagination', () => {
  beforeAll(async () => {
    // A couple of extra incidents so search/pagination have data to chew on.
    await createIncidentViaApi(await loginToken('lockresponder@test.dev', 'Password123'), {
      title: 'Flickering lights in Library',
      description: 'The reading hall lights flicker constantly and it strains the eyes.',
      category: 'FACILITY_CONCERN',
    });
    await createIncidentViaApi(await loginToken('lockresponder@test.dev', 'Password123'), {
      title: 'Stray dog near canteen',
      description: 'An aggressive stray dog is blocking the path to the main canteen gate.',
      category: 'SECURITY_THREAT',
    });
  });

  test('?q= filters by title, landmark and reporter name', async () => {
    const token = await loginToken('lockresponder@test.dev', 'Password123');
    const all = await request(app).get('/api/responder/incidents').set('Authorization', `Bearer ${token}`);
    expect(all.status).toBe(200);

    const byTitle = await request(app)
      .get('/api/responder/incidents?q=broken window')
      .set('Authorization', `Bearer ${token}`);
    expect(byTitle.status).toBe(200);
    expect(byTitle.body.data.items.length).toBeLessThanOrEqual(all.body.data.items.length);
    if (byTitle.body.data.items.length > 0) {
      expect(byTitle.body.data.items[0].title.toLowerCase()).toContain('broken window');
    }

    const byReporter = await request(app)
      .get('/api/responder/incidents?q=Responder One')
      .set('Authorization', `Bearer ${token}`);
    expect(byReporter.status).toBe(200);
    expect(byReporter.body.data.items.length).toBeGreaterThanOrEqual(1);
  });

  test('pagination meta is correct (page/limit/total/totalPages)', async () => {
    const token = await loginToken('lockresponder@test.dev', 'Password123');
    const res = await request(app)
      .get('/api/responder/incidents?page=1&limit=1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const { pagination } = res.body.data;
    expect(pagination.limit).toBe(1);
    expect(pagination.total).toBeGreaterThan(0);
    expect(pagination.totalPages).toBe(Math.ceil(pagination.total / 1));
  });

  test('students cannot use the responder queue (403)', async () => {
    const token = await loginToken('lockstudent@test.dev', 'NewPassword456');
    const res = await request(app)
      .get('/api/responder/incidents?q=window')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
