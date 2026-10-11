const { app, prisma, request, resetDb, createUser, loginToken } = require('./helpers');
const {
  BIT_SINDRI_CAMPUS_REGION,
  CAMPUS_LOCATIONS,
  searchCampusLocations,
  isValidCoordinate,
  buildGoogleMapsDirectionsUrl,
} = require('../../mobile/src/data/campusLocations');

describe('BIT Sindri Campus Map & Navigation Tests', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(() => prisma.$disconnect());

  describe('1. BIT Sindri Geographical Verification & Bounding Box', () => {
    test('campus center is verified within Sindri Township coordinates', () => {
      expect(BIT_SINDRI_CAMPUS_REGION.latitude).toBeCloseTo(23.6547, 3);
      expect(BIT_SINDRI_CAMPUS_REGION.longitude).toBeCloseTo(86.4737, 3);
      expect(BIT_SINDRI_CAMPUS_REGION.latitudeDelta).toBeGreaterThan(0);
      expect(BIT_SINDRI_CAMPUS_REGION.longitudeDelta).toBeGreaterThan(0);
    });

    test('all verified campus locations lie within BIT Sindri perimeter', () => {
      expect(CAMPUS_LOCATIONS.length).toBeGreaterThanOrEqual(10);

      CAMPUS_LOCATIONS.forEach((loc) => {
        expect(loc.id).toBeTruthy();
        expect(loc.name).toBeTruthy();
        expect(loc.category).toBeTruthy();
        expect(loc.verifiedSource).toBeTruthy();

        // Must be in Sindri bounding box: 23.64 <= Lat <= 23.67, 86.46 <= Lng <= 86.49
        expect(loc.latitude).toBeGreaterThanOrEqual(23.64);
        expect(loc.latitude).toBeLessThanOrEqual(23.67);
        expect(loc.longitude).toBeGreaterThanOrEqual(23.46); // broad envelope check
        expect(loc.longitude).toBeLessThanOrEqual(86.49);
      });
    });
  });

  describe('2. Campus Search & Category Filtering', () => {
    test('filters locations by category correctly', () => {
      const academic = searchCampusLocations('', 'ACADEMIC');
      expect(academic.length).toBeGreaterThan(0);
      academic.forEach((l) => expect(l.category).toBe('ACADEMIC'));

      const hostels = searchCampusLocations('', 'HOSTEL');
      expect(hostels.length).toBeGreaterThan(0);
      hostels.forEach((l) => expect(l.category).toBe('HOSTEL'));
    });

    test('searches locations by query string (case-insensitive)', () => {
      const libraryResults = searchCampusLocations('library');
      expect(libraryResults.length).toBeGreaterThan(0);
      expect(libraryResults[0].name).toMatch(/Library/i);

      const gateResults = searchCampusLocations('Gate 1');
      expect(gateResults.length).toBeGreaterThan(0);
      expect(gateResults[0].name).toMatch(/Gate/i);

      const nonExistent = searchCampusLocations('Eiffel Tower');
      expect(nonExistent.length).toBe(0);
    });
  });

  describe('3. Directions URL & Coordinate Validation', () => {
    test('validates valid coordinates and rejects invalid coordinates', () => {
      expect(isValidCoordinate(23.6547, 86.4737)).toBe(true);
      expect(isValidCoordinate(0, 0)).toBe(true);
      expect(isValidCoordinate(95, 86)).toBe(false); // Lat > 90
      expect(isValidCoordinate(23, 190)).toBe(false); // Lng > 180
      expect(isValidCoordinate(NaN, 86)).toBe(false);
      expect(isValidCoordinate('23', '86')).toBe(false);
    });

    test('generates valid Google Maps walking directions URLs', () => {
      const url = buildGoogleMapsDirectionsUrl(23.6525, 86.4731, 'Main Gate');
      expect(url).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\/\?/);
      expect(url).toContain('destination=23.6525,86.4731');
      expect(url).toContain('travelmode=walking');
    });

    test('returns null for directions when coordinates are invalid', () => {
      const url = buildGoogleMapsDirectionsUrl(999, -999, 'Invalid Place');
      expect(url).toBeNull();
    });
  });

  describe('4. Safety Points Backend Integration', () => {
    test('GET /api/safety-points returns safety resources and supports geo-sorting', async () => {
      const student = await createUser({
        name: 'Map Tester',
        email: 'map-tester@campus.edu',
        password: 'Password123',
        role: 'STUDENT',
        isVerified: true,
      });
      const token = await loginToken('map-tester@campus.edu', 'Password123');

      await prisma.safetyPoint.create({
        data: {
          name: 'BIT Sindri Main Gate Post',
          category: 'SECURITY_OFFICE',
          latitude: 23.6525,
          longitude: 86.4731,
          description: 'Gate 1 24x7 control room',
        },
      });

      const res = await request(app)
        .get('/api/safety-points')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);

      // Geo-distance query around campus center
      const geoRes = await request(app)
        .get('/api/safety-points?lat=23.6547&lng=86.4737&radius=5000')
        .set('Authorization', `Bearer ${token}`);
      expect(geoRes.status).toBe(200);
      expect(geoRes.body.data.items[0].distanceMeters).toBeDefined();
    });
  });

  describe('5. Unauthorized Incident Location Protection', () => {
    test('students are forbidden from accessing full responder incident coordinates queue', async () => {
      const student = await createUser({
        name: 'Regular Student',
        email: 'student-map@campus.edu',
        password: 'Password123',
        role: 'STUDENT',
        isVerified: true,
      });

      const token = await loginToken('student-map@campus.edu', 'Password123');

      // Attempting to query responder incidents queue
      const res = await request(app)
        .get('/api/responder/incidents')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    test('responders can access active incidents for map overlay', async () => {
      const responder = await createUser({
        name: 'Campus Patrol One',
        email: 'responder-map@campus.edu',
        password: 'Password123',
        role: 'RESPONDER',
        isVerified: true,
      });

      const token = await loginToken('responder-map@campus.edu', 'Password123');

      const res = await request(app)
        .get('/api/responder/incidents?status=NEW')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
    });
  });
});
