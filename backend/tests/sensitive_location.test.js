const { app, prisma, request, resetDb, registerAndLogin, createStaffToken } = require('./helpers');

describe('Sensitive Complaints, Location Verification & Campus Geofence', () => {
  let studentToken, responderToken, adminToken;
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  beforeEach(async () => {
    ({ token: studentToken } = await registerAndLogin({
      name: 'Rohan Sharma',
      email: 'rohan@campus.edu',
      password: 'Passw0rd1',
    }));
    responderToken = await createStaffToken({ email: 'patrol@campus.edu', role: 'RESPONDER' });
    adminToken = await createStaffToken({ email: 'director@campus.edu', role: 'ADMIN' });
  });

  describe('1. Sensitive / Confidential Complaints', () => {
    test('submits a confidential complaint with accused party and independent escalation', async () => {
      const res = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          title: 'Harassment & Abuse of Authority in Mech Lab',
          description: 'A senior laboratory staff member intimidated and threatened disciplinary action unfairly.',
          category: 'HARASSMENT',
          priority: 'HIGH',
          isSensitive: true,
          sensitiveCategory: 'ABUSE_OF_AUTHORITY',
          accusedPerson: 'Lab Supervisor Dr. K. Verma',
          accusedDepartment: 'Mechanical Department Workshops',
          confidentialityNoticeAcknowledged: true,
          location: {
            latitude: 23.6548,
            longitude: 86.4738,
            campusLandmark: 'Mechanical Workshop Wing',
          },
        });

      expect(res.status).toBe(201);
      const { incident } = res.body.data;
      expect(incident.isSensitive).toBe(true);
      expect(incident.independentReviewerOnly).toBe(true);
      expect(incident.escalationPath).toBe('INDEPENDENT_REVIEW');
      expect(incident.accusedPerson).toBe('Lab Supervisor Dr. K. Verma');
      expect(incident.accusedDepartment).toBe('Mechanical Department Workshops');
      expect(incident.confidentialityNoticeAcknowledged).toBe(true);

      // Verify audit history was recorded
      const history = await prisma.incidentStatusHistory.findMany({ where: { incidentId: incident.id } });
      expect(history.some((h) => h.responderNotes.includes('Confidential / Sensitive'))).toBe(true);
    });

    test('sensitive complaints are blocked from standard RESPONDERS and visible to ADMIN', async () => {
      const created = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          title: 'Threats and Extortion by Hostel Staff',
          description: 'Staff member demanding unofficial mess fees under threat of hostel expulsion.',
          category: 'HARASSMENT',
          priority: 'HIGH',
          isSensitive: true,
          accusedPerson: 'Hostel Manager',
          confidentialityNoticeAcknowledged: true,
        });

      const incidentId = created.body.data.incident.id;

      // Owner can view
      const ownerRes = await request(app)
        .get(`/api/incidents/${incidentId}`)
        .set('Authorization', `Bearer ${studentToken}`);
      expect(ownerRes.status).toBe(200);

      // Standard RESPONDER is blocked with 403 SENSITIVE_ACCESS_RESTRICTED
      const responderRes = await request(app)
        .get(`/api/incidents/${incidentId}`)
        .set('Authorization', `Bearer ${responderToken}`);
      expect(responderRes.status).toBe(403);
      expect(responderRes.body.error.code).toBe('SENSITIVE_ACCESS_RESTRICTED');

      // Regular responder queue does NOT list sensitive complaints
      const listRes = await request(app)
        .get('/api/responder/incidents')
        .set('Authorization', `Bearer ${responderToken}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.data.items.some((it) => it.id === incidentId)).toBe(false);

      // ADMIN (Independent Oversight Authority) can view
      const adminRes = await request(app)
        .get(`/api/incidents/${incidentId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(adminRes.status).toBe(200);
      expect(adminRes.body.data.incident.id).toBe(incidentId);

      // ADMIN queue includes sensitive complaints
      const adminListRes = await request(app)
        .get('/api/responder/incidents?isSensitive=true')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(adminListRes.status).toBe(200);
      expect(adminListRes.body.data.items.some((it) => it.id === incidentId)).toBe(true);
    });

    test('regular responder cannot update status on sensitive complaint', async () => {
      const created = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          title: 'Misconduct by Faculty Committee Member',
          description: 'Faculty member retaliated after academic grievance was filed.',
          category: 'HARASSMENT',
          isSensitive: true,
          confidentialityNoticeAcknowledged: true,
        });
      const incidentId = created.body.data.incident.id;

      const patchRes = await request(app)
        .patch(`/api/responder/incidents/${incidentId}/status`)
        .set('Authorization', `Bearer ${responderToken}`)
        .send({ newStatus: 'ACKNOWLEDGED' });

      expect(patchRes.status).toBe(403);
      expect(patchRes.body.error.code).toBe('SENSITIVE_ACCESS_RESTRICTED');
    });
  });

  describe('2. Location Verification & Discrepancy Detection', () => {
    test('marks VERIFIED_MATCH when current GPS and selected location are close', async () => {
      const res = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          title: 'Water pipe leak near hostel circle',
          description: 'Drinking water pipeline ruptured creating puddles across walkway.',
          category: 'FACILITY_CONCERN',
          location: {
            currentLatitude: 23.6547,
            currentLongitude: 86.4737,
            selectedLatitude: 23.6550,
            selectedLongitude: 86.4740,
            gpsAccuracy: 15,
            campusLandmark: 'Central Water Tank',
          },
        });

      expect(res.status).toBe(201);
      const loc = res.body.data.incident.location;
      expect(loc.verificationStatus).toBe('VERIFIED_MATCH');
      expect(loc.isMismatch).toBe(false);
      expect(loc.isOutsideCampus).toBe(false);
    });

    test('detects LOCATION_MISMATCH when selected location is distant from current GPS', async () => {
      const res = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          title: 'Streetlight failure in distant sector',
          description: 'Main pathway streetlights are completely dead in the evening.',
          category: 'FACILITY_CONCERN',
          location: {
            currentLatitude: 23.6547,
            currentLongitude: 86.4737,
            selectedLatitude: 23.6620, // ~850 meters away
            selectedLongitude: 86.4800,
            gpsAccuracy: 20,
            campusLandmark: 'North Boundary Road',
          },
        });

      expect(res.status).toBe(201);
      const loc = res.body.data.incident.location;
      expect(loc.isMismatch).toBe(true);
      expect(loc.verificationStatus).toBe('LOCATION_MISMATCH');
      expect(loc.mismatchDistanceMeters).toBeGreaterThan(400);

      // Audit log records review flag without rejecting report
      const history = await prisma.incidentStatusHistory.findMany({ where: { incidentId: res.body.data.incident.id } });
      expect(history.some((h) => h.responderNotes.includes('Location discrepancy noted'))).toBe(true);
    });

    test('sets CONFIRMED_ELSEWHERE when student confirms incident occurred elsewhere', async () => {
      const res = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          title: 'Earlier theft reported from hostel room',
          description: 'Reporting laptop bag left in auditorium this morning while currently in hostel.',
          category: 'SECURITY_THREAT',
          location: {
            currentLatitude: 23.6547,
            currentLongitude: 86.4737,
            selectedLatitude: 23.6650,
            selectedLongitude: 86.4850,
            gpsAccuracy: 25,
            mismatchConfirmed: true,
            campusLandmark: 'Deshpande Auditorium',
          },
        });

      expect(res.status).toBe(201);
      const loc = res.body.data.incident.location;
      expect(loc.isMismatch).toBe(true);
      expect(loc.mismatchConfirmed).toBe(true);
      expect(loc.verificationStatus).toBe('CONFIRMED_ELSEWHERE');
    });

    test('flags isOutsideCampus without blocking submission for off-campus incidents', async () => {
      const res = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          title: 'Off-campus student bus accident',
          description: 'University transit bus met with a minor accident outside township limits.',
          category: 'FACILITY_CONCERN',
          location: {
            latitude: 23.7000, // Outside ~1200m campus boundary
            longitude: 86.5500,
            campusLandmark: 'Dhanbad Station Road (~15km off campus)',
          },
        });

      expect(res.status).toBe(201);
      const loc = res.body.data.incident.location;
      expect(loc.isOutsideCampus).toBe(true);
    });

    test('Emergency SOS never blocked when location is absent or unverified', async () => {
      // SOS with no coordinates
      const sosNoLoc = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ isSos: true });

      expect(sosNoLoc.status).toBe(201);
      expect(sosNoLoc.body.data.incident.isSos).toBe(true);
      expect(sosNoLoc.body.data.incident.priority).toBe('CRITICAL');

      // Second student: SOS with off-campus location
      const { token: studentToken2 } = await registerAndLogin({
        name: 'Priya Verma',
        email: 'priya-sos-loc@campus.edu',
        password: 'Passw0rd1',
      });

      const sosOffCampus = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${studentToken2}`)
        .send({
          isSos: true,
          location: {
            latitude: 23.7500,
            longitude: 86.6000,
            campusLandmark: 'Off-campus highway',
          },
        });

      expect(sosOffCampus.status).toBe(201);
      expect(sosOffCampus.body.data.incident.location.isOutsideCampus).toBe(true);
    });
  });
});
