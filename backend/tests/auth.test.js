const jwt = require('jsonwebtoken');
const { app, prisma, request, resetDb, registerAndLogin } = require('./helpers');
const { env } = require('../src/config/env');

describe('Authentication', () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  test('register creates a STUDENT account and returns a token (never the hash)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Aarav Rao', email: 'aarav@campus.edu', password: 'Passw0rd1' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.role).toBe('STUDENT');
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');

    const dbUser = await prisma.user.findUnique({ where: { email: 'aarav@campus.edu' } });
    expect(dbUser.role).toBe('STUDENT');
    expect(dbUser.passwordHash).not.toBe('Passw0rd1'); // bcrypt-hashed, not plaintext
  });

  test('register rejects duplicate email with 409', async () => {
    await registerAndLogin({ name: 'First One', email: 'dupe@campus.edu', password: 'Passw0rd1' });
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Second One', email: 'DUPE@campus.edu', password: 'Passw0rd2' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_IN_USE');
  });

  test('register rejects invalid email / weak password / missing name with 422', async () => {
    const cases = [
      { name: 'X Y', email: 'not-an-email', password: 'Passw0rd1' },
      { name: 'X Y', email: 'ok@campus.edu', password: 'short1' },
      { name: 'X Y', email: 'ok@campus.edu', password: 'nonumbershere' },
      { email: 'ok@campus.edu', password: 'Passw0rd1' },
    ];
    for (const body of cases) {
      const res = await request(app).post('/api/auth/register').send(body);
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  test('login succeeds with correct credentials', async () => {
    await registerAndLogin({ name: 'Aarav Rao', email: 'aarav@campus.edu', password: 'Passw0rd1' });
    const res = await request(app).post('/api/auth/login').send({ email: 'aarav@campus.edu', password: 'Passw0rd1' });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.user.email).toBe('aarav@campus.edu');
  });

  test('wrong password and unknown email return the SAME generic 401 (no user enumeration)', async () => {
    await registerAndLogin({ name: 'Aarav Rao', email: 'aarav@campus.edu', password: 'Passw0rd1' });

    const wrongPassword = await request(app).post('/api/auth/login').send({ email: 'aarav@campus.edu', password: 'WrongPass1' });
    const unknownEmail = await request(app).post('/api/auth/login').send({ email: 'ghost@campus.edu', password: 'Whatever1' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error.code).toBe(unknownEmail.body.error.code);
    expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
  });

  test('GET /me returns the token owner; missing/garbage tokens are rejected', async () => {
    const { token } = await registerAndLogin({ name: 'Aarav Rao', email: 'aarav@campus.edu', password: 'Passw0rd1' });

    const ok = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(ok.status).toBe(200);
    expect(ok.body.data.user.email).toBe('aarav@campus.edu');

    const missing = await request(app).get('/api/auth/me');
    expect(missing.status).toBe(401);
    expect(missing.body.error.code).toBe('TOKEN_MISSING');

    const garbage = await request(app).get('/api/auth/me').set('Authorization', 'Bearer not-a-jwt');
    expect(garbage.status).toBe(401);
    expect(garbage.body.error.code).toBe('TOKEN_INVALID');
  });

  test('expired tokens are rejected with TOKEN_EXPIRED', async () => {
    const { user } = await registerAndLogin({ name: 'Aarav Rao', email: 'aarav@campus.edu', password: 'Passw0rd1' });
    const expired = jwt.sign({ sub: user.id, role: user.role }, env.jwtSecret, { expiresIn: '1s' });
    await new Promise((r) => setTimeout(r, 1200));

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  test('setup-responder creates RESPONDER only with the correct setup code', async () => {
    const bad = await request(app)
      .post('/api/auth/setup-responder')
      .send({ name: 'Desk One', email: 'desk@campus.edu', password: 'Passw0rd1', setupCode: 'wrong-code' });
    expect(bad.status).toBe(403);
    expect(bad.body.error.code).toBe('INVALID_SETUP_CODE');

    const good = await request(app)
      .post('/api/auth/setup-responder')
      .send({ name: 'Desk One', email: 'desk@campus.edu', password: 'Passw0rd1', setupCode: 'jest-setup-code-99' });
    expect(good.status).toBe(201);
    expect(good.body.data.user.role).toBe('RESPONDER');

    const dbUser = await prisma.user.findUnique({ where: { email: 'desk@campus.edu' } });
    expect(dbUser.role).toBe('RESPONDER');
  });

  test('client-supplied role is ignored — register cannot create a RESPONDER', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Sneaky Student', email: 'sneaky@campus.edu', password: 'Passw0rd1', role: 'RESPONDER' });
    expect(res.status).toBe(201);
    const dbUser = await prisma.user.findUnique({ where: { email: 'sneaky@campus.edu' } });
    expect(dbUser.role).toBe('STUDENT');
  });
});
