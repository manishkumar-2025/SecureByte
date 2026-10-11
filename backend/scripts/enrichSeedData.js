/* eslint-disable no-console */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Enriching demo incidents for student@securebyte.dev...');
  const student = await prisma.user.findUnique({ where: { email: 'student@securebyte.dev' } });
  const responder = await prisma.user.findUnique({ where: { email: 'responder@securebyte.dev' } });

  if (!student || !responder) {
    console.error('Demo users not found. Run seed first.');
    return;
  }

  // 1. Acknowledged Incident
  const existingAck = await prisma.incident.findFirst({
    where: { reporterId: student.id, title: 'Exposed wiring near Mechanical Workshop Entry' },
  });
  if (!existingAck) {
    const inc = await prisma.incident.create({
      data: {
        reporterId: student.id,
        title: 'Exposed wiring near Mechanical Workshop Entry',
        description: 'High-voltage junction wire insulation is cracked and hanging at shoulder level near the machine shop gate. Poses immediate electrical hazard especially with wet weather.',
        category: 'FACILITY_CONCERN',
        priority: 'HIGH',
        status: 'ACKNOWLEDGED',
        location: {
          create: {
            campusLandmark: 'Mechanical Workshop, Building 4',
            buildingOrRoom: 'North entrance gangway',
            latitude: 23.6538,
            longitude: 86.4748,
          },
        },
      },
    });
    await prisma.incidentStatusHistory.create({
      data: {
        incidentId: inc.id,
        updatedBy: responder.id,
        previousStatus: 'NEW',
        newStatus: 'ACKNOWLEDGED',
        responderNotes: 'Safety desk acknowledged. Electrical maintenance crew dispatched with warning cones. Technician on site in ~15 mins.',
      },
    });
    console.log('Created ACKNOWLEDGED incident:', inc.id);
  }

  // 2. In Progress Incident
  const existingProg = await prisma.incident.findFirst({
    where: { reporterId: student.id, title: 'Sports pavilion floodlight failure' },
  });
  if (!existingProg) {
    const inc = await prisma.incident.create({
      data: {
        reporterId: student.id,
        title: 'Sports pavilion floodlight failure',
        description: '3 out of 4 high-beam floodlights on court B went dark during evening sports practice. Entire approach walkway is pitch black creating safety concern.',
        category: 'FACILITY_CONCERN',
        priority: 'MEDIUM',
        status: 'IN_PROGRESS',
        location: {
          create: {
            campusLandmark: 'Gymkhana Sports Pavilion',
            buildingOrRoom: 'Court B (West side)',
            latitude: 23.6568,
            longitude: 86.4758,
          },
        },
      },
    });
    await prisma.incidentStatusHistory.createMany({
      data: [
        {
          incidentId: inc.id,
          updatedBy: responder.id,
          previousStatus: 'NEW',
          newStatus: 'ACKNOWLEDGED',
          responderNotes: 'Incident logged. Estate maintenance scheduled inspection.',
        },
        {
          incidentId: inc.id,
          updatedBy: responder.id,
          previousStatus: 'ACKNOWLEDGED',
          newStatus: 'IN_PROGRESS',
          responderNotes: 'Maintenance team on site replacing burnt ballast and halogen lamps. Expected restoration by 6:00 PM.',
        },
      ],
    });
    console.log('Created IN_PROGRESS incident:', inc.id);
  }

  // 3. Resolved Medical Incident
  const existingMed = await prisma.incident.findFirst({
    where: { reporterId: student.id, title: 'Medical first aid requested at Sports Ground' },
  });
  if (!existingMed) {
    const inc = await prisma.incident.create({
      data: {
        reporterId: student.id,
        title: 'Medical first aid requested at Sports Ground',
        description: 'Student twisted left ankle during football practice drill. Rapid swelling and intense pain, unable to walk unassisted.',
        category: 'MEDICAL_EMERGENCY',
        priority: 'HIGH',
        status: 'RESOLVED',
        location: {
          create: {
            campusLandmark: 'Central Sports Ground',
            buildingOrRoom: 'Track side bench #2',
            latitude: 23.6565,
            longitude: 86.4728,
          },
        },
      },
    });
    await prisma.incidentStatusHistory.createMany({
      data: [
        {
          incidentId: inc.id,
          updatedBy: responder.id,
          previousStatus: 'NEW',
          newStatus: 'ACKNOWLEDGED',
          responderNotes: 'BIT Dispensary medical station notified. Campus ambulance dispatched.',
        },
        {
          incidentId: inc.id,
          updatedBy: responder.id,
          previousStatus: 'ACKNOWLEDGED',
          newStatus: 'IN_PROGRESS',
          responderNotes: 'Ambulance team on site. Ice compression and splint bandage applied.',
        },
        {
          incidentId: inc.id,
          updatedBy: responder.id,
          previousStatus: 'IN_PROGRESS',
          newStatus: 'RESOLVED',
          responderNotes: 'Patient evaluated at BIT Dispensary. X-ray cleared fracture. Prescribed medication and rest. Incident resolved.',
        },
      ],
    });
    console.log('Created RESOLVED medical incident:', inc.id);
  }

  // 4. Update the demo SOS alert to have location and landmark
  const sosInc = await prisma.incident.findFirst({
    where: { reporterId: student.id, isSos: true },
    include: { location: true },
  });
  if (sosInc && !sosInc.location) {
    await prisma.incidentLocation.create({
      data: {
        incidentId: sosInc.id,
        campusLandmark: 'Hostel Circle Gate 2',
        buildingOrRoom: 'Senior Boys Hostel Block',
        latitude: 23.6582,
        longitude: 86.4715,
      },
    });
    console.log('Enriched SOS location coordinates for:', sosInc.id);
  }

  console.log('Enrichment complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
