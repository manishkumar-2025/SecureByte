const request = require('supertest');
const { createApp } = require('../src/app');
const { prisma } = require('../src/lib/prisma');
const { hashPassword } = require('../src/utils/password');

const app = createApp();

/** Deletes all rows in FK-safe order. Called between tests. */
async function resetDb() {
  await prisma.notification.deleteMany();
  await prisma.checkIn.deleteMany();
  await prisma.emergencyContact.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.pushToken.deleteMany();
  await prisma.incidentStatusHistory.deleteMany();
  await prisma.incidentLocation.deleteMany();
  await prisma.incident.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.user.deleteMany();
  await prisma.safetyPoint.deleteMany();
}

async function createUser({ name = 'Test User', email, password = 'Password123', role = 'STUDENT' }) {
  return prisma.user.create({ data: { name, email, passwordHash: await hashPassword(password), role } });
}

async function registerAndLogin({ name, email, password }) {
  const res = await request(app).post('/api/auth/register').send({ name, email, password });
  if (res.status !== 201) throw new Error(`register failed: ${JSON.stringify(res.body)}`);
  const data = res.body.data;
  // Normalized shape: tests keep using `token` while the API returns accessToken.
  return { user: data.user, token: data.accessToken, refreshToken: data.refreshToken };
}

async function loginToken(email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login failed: ${JSON.stringify(res.body)}`);
  return res.body.data.accessToken;
}

async function createIncidentViaApi(token, overrides = {}) {
  const payload = {
    title: 'Broken window in Lab 4',
    description: 'A large window pane in Lab 4 is shattered and students pass right next to it.',
    category: 'FACILITY_CONCERN',
    ...overrides,
  };
  const res = await request(app).post('/api/incidents').set('Authorization', `Bearer ${token}`).send(payload);
  if (res.status !== 201) throw new Error(`incident create failed: ${JSON.stringify(res.body)}`);
  return res.body.data.incident;
}

module.exports = { app, prisma, request, resetDb, createUser, registerAndLogin, loginToken, createIncidentViaApi };
