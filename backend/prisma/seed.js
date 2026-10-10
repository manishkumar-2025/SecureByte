/* eslint-disable no-console */
require('dotenv').config();
// Seeds clearly-identified DEMONSTRATION data for the hackathon build.
// Safe to re-run: users are upserted; announcements/incidents are only
// created when the tables are empty.
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function upsertUser({ name, email, password, role }) {
  const passwordHash = await bcrypt.hash(password, Number(process.env.BCRYPT_ROUNDS) || 10);
  return prisma.user.upsert({
    where: { email },
    update: { name, role, passwordHash },
    create: { name, email, passwordHash, role },
  });
}

async function main() {
  console.log('Seeding demo data…');

  const student = await upsertUser({
    name: 'Ayush Kumar',
    email: 'student@securebyte.dev',
    password: 'Student@123',
    role: 'STUDENT',
  });
  const student2 = await upsertUser({
    name: 'Priya Sharma',
    email: 'priya@securebyte.dev',
    password: 'Student@123',
    role: 'STUDENT',
  });
  const responder = await upsertUser({
    name: 'Campus Safety Desk',
    email: 'responder@securebyte.dev',
    password: 'Responder@123',
    role: 'RESPONDER',
  });
  const admin = await upsertUser({
    name: 'Safety Admin',
    email: 'admin@securebyte.dev',
    password: 'Admin@12345',
    role: 'ADMIN',
  });

  // Demo personal emergency contacts for the student account.
  if ((await prisma.emergencyContact.count({ where: { userId: student.id } })) === 0) {
    await prisma.emergencyContact.createMany({
      data: [
        { userId: student.id, name: 'Mom', phone: '+919876543210', relation: 'Family' },
        { userId: student.id, name: 'Rahul (Roommate)', phone: '+919812345678', relation: 'Friend' },
      ],
    });
  }

  // Campus safety map points (ISM Dhanbad area, demo coordinates).
  if ((await prisma.safetyPoint.count()) === 0) {
    await prisma.safetyPoint.createMany({
      data: [
        { name: 'Main Gate Security Office', category: 'SECURITY_OFFICE', latitude: 23.8144, longitude: 86.4407, description: '24×7 staffed security control room, next to the main gate.' },
        { name: 'Hostel Circle Security Post', category: 'SECURITY_OFFICE', latitude: 23.8169, longitude: 86.4378, description: 'Secondary security post serving the hostel block.' },
        { name: 'Academic Block A — East Exit', category: 'EMERGENCY_EXIT', latitude: 23.8151, longitude: 86.4415, description: 'Marked emergency exit with assembly point outside.' },
        { name: 'Library West Emergency Exit', category: 'EMERGENCY_EXIT', latitude: 23.8138, longitude: 86.4395, description: 'Ground-floor west fire exit, keep clear at all times.' },
        { name: 'Canteen Fire Extinguisher Panel', category: 'FIRE_EXTINGUISHER', latitude: 23.8147, longitude: 86.4411, description: 'ABC extinguishers + fire blanket near the kitchen.' },
        { name: 'Workshop Fire Point', category: 'FIRE_EXTINGUISHER', latitude: 23.8160, longitude: 86.4388, description: 'CO₂ extinguishers by the machine-shop entrance.' },
        { name: 'Health Centre — First Aid', category: 'FIRST_AID', latitude: 23.8155, longitude: 86.4398, description: 'Campus health centre, staffed 8 AM – 8 PM.' },
        { name: 'Sports Ground AED Cabinet', category: 'AED', latitude: 23.8172, longitude: 86.4402, description: 'Defibrillator in the pavilion, unlocked during events.' },
        { name: 'Auditorium Shelter Area', category: 'SHELTER', latitude: 23.8134, longitude: 86.4418, description: 'Designated severe-weather shelter (basement hall).' },
      ],
    });
  }

  if ((await prisma.announcement.count()) === 0) {
    await prisma.announcement.createMany({
      data: [
        {
          authorId: responder.id,
          title: 'Fire drill — Main Block, Friday 11:00 AM',
          message:
            'A scheduled fire drill will take place this Friday at 11:00 AM. Exit via the marked stairwells and gather at the sports ground. Do not use the lift during the drill.',
          severity: 'INFO',
        },
        {
          authorId: responder.id,
          title: 'Heavy rain alert — avoid the underpass route',
          message:
            'The meteorology department has issued a heavy-rain warning for this evening. The library underpass floods quickly. Please use the first-floor bridge walkway instead.',
          severity: 'WARNING',
        },
      ],
    });
  }

  if ((await prisma.incident.count()) === 0) {
    const fire = await prisma.incident.create({
      data: {
        reporterId: student.id,
        title: 'Smoke smell near Canteen kitchen',
        description:
          'Strong smoke smell coming from the canteen kitchen exhaust around 12:40 PM. No visible flames yet, area getting crowded.',
        category: 'FIRE_HAZARD',
        priority: 'HIGH',
        status: 'RESOLVED',
        location: { create: { campusLandmark: 'Main Canteen, Block B', buildingOrRoom: 'Kitchen exhaust side' } },
      },
    });
    await prisma.incidentStatusHistory.createMany({
      data: [
        { incidentId: fire.id, updatedBy: responder.id, previousStatus: 'NEW', newStatus: 'ACKNOWLEDGED', responderNotes: 'Fire safety team notified.' },
        { incidentId: fire.id, updatedBy: responder.id, previousStatus: 'ACKNOWLEDGED', newStatus: 'IN_PROGRESS', responderNotes: 'Team on site; kitchen staff shutting down burners.' },
        { incidentId: fire.id, updatedBy: responder.id, previousStatus: 'IN_PROGRESS', newStatus: 'RESOLVED', responderNotes: 'Cause was burnt oil; ventilation cleared. All clear.' },
      ],
    });

    await prisma.incident.create({
      data: {
        reporterId: student2.id,
        title: 'Broken light in Library corridor',
        description: 'The corridor light between the reading hall and lockers is flickering badly since yesterday night.',
        category: 'FACILITY_CONCERN',
        priority: 'LOW',
        status: 'NEW',
        location: { create: { campusLandmark: 'Central Library', buildingOrRoom: 'Ground floor corridor' } },
      },
    });

    const sos = await prisma.incident.create({
      data: {
        reporterId: student.id,
        title: 'Emergency SOS Alert',
        description: 'Emergency SOS alert triggered from the SecureByte mobile app.',
        category: 'SOS_ALERT',
        priority: 'CRITICAL',
        status: 'NEW',
        isSos: true,
        location: { create: { campusLandmark: 'Hostel Gate 2' } },
      },
    });
    console.log(`  (demo SOS incident: ${sos.id})`);
  }

  console.log('Seed complete. DEMO ACCOUNTS:');
  console.log('  STUDENT    student@securebyte.dev   / Student@123');
  console.log('  STUDENT    priya@securebyte.dev     / Student@123');
  console.log('  RESPONDER  responder@securebyte.dev / Responder@123');
  console.log('  ADMIN      admin@securebyte.dev     / Admin@12345');
  console.log('  These are demonstration credentials only — remove before any real use.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
