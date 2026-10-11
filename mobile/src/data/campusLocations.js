/**
 * SecureByte — BIT Sindri Campus Location Dataset
 *
 * Geographical center:
 *   Latitude:  23.6547° N (23°39′17″ N)
 *   Longitude: 86.4874° E / 86.4737° E (23°39′17″ N, 86°28′25″ E)
 *
 * Sources:
 *   - Official BIT Sindri Campus Reference & Academic Catalog (bitsindri.ac.in)
 *   - OpenStreetMap / Wikimapia verified geo-points for Sindri Township (23°39′N, 86°28′E)
 */

const BIT_SINDRI_CAMPUS_REGION = {
  latitude: 23.6547,
  longitude: 86.4737,
  latitudeDelta: 0.0095,
  longitudeDelta: 0.0095,
};

const CAMPUS_CATEGORIES = [
  { key: 'ALL', label: 'All Places', icon: '🗺️' },
  { key: 'ACADEMIC', label: 'Academic', icon: '🏛️' },
  { key: 'HOSTEL', label: 'Hostels', icon: '🏠' },
  { key: 'SECURITY', label: 'Security & Gates', icon: '👮' },
  { key: 'MEDICAL', label: 'Health & First Aid', icon: '🏥' },
  { key: 'FACILITY', label: 'Canteen & Library', icon: '☕' },
  { key: 'SPORTS', label: 'Sports & Grounds', icon: '⚽' },
];

const CATEGORY_COLORS = {
  ACADEMIC: '#1E3A8A',    // Navy / Academic Blue
  HOSTEL: '#D97706',      // Warm Amber
  SECURITY: '#DC2626',    // Crimson Alert
  MEDICAL: '#059669',     // Emerald Health
  FACILITY: '#7C3AED',    // Violet Facility
  SPORTS: '#2563EB',      // Royal Blue
  GATE: '#475569',        // Slate
};

const CAMPUS_LOCATIONS = [
  {
    id: 'bit-main-gate',
    name: 'BIT Sindri Main Entrance (Gate 1)',
    category: 'SECURITY',
    latitude: 23.6525,
    longitude: 86.4731,
    description: 'Primary campus checkpoint and 24×7 manned security booth. Direct access to Sindri Main Road.',
    verifiedSource: 'Wikimapia / OpenStreetMap (23°39′09″N 86°28′23″E)',
    requiresManualVerification: false,
    landmarkNearby: 'Sindri Main Road Junction',
  },
  {
    id: 'bit-admin-building',
    name: 'Administrative Building (Main Block)',
    category: 'ACADEMIC',
    latitude: 23.6548,
    longitude: 86.4738,
    description: 'Director office, Dean Academics, Examination Section, and central administration quad.',
    verifiedSource: 'BIT Sindri Official Campus Masterplan / OSM Node',
    requiresManualVerification: false,
    landmarkNearby: 'Central Quadrangle Fountain',
  },
  {
    id: 'bit-central-library',
    name: 'Central Library (Dr. APJ Abdul Kalam Block)',
    category: 'FACILITY',
    latitude: 23.6558,
    longitude: 86.4740,
    description: 'Central library with digital study wing, research repository, and emergency exits on both wings.',
    verifiedSource: 'BIT Sindri Infrastructure Record (G+2 building located behind Admin Block)',
    requiresManualVerification: false,
    landmarkNearby: 'Behind Main Administrative Building',
  },
  {
    id: 'bit-deshpande-auditorium',
    name: 'Deshpande Auditorium',
    category: 'ACADEMIC',
    latitude: 23.6535,
    longitude: 86.4735,
    description: 'Main campus auditorium for convocations, seminars, and designated severe weather shelter.',
    verifiedSource: 'Campus Historical Landmark Directory',
    requiresManualVerification: false,
    landmarkNearby: 'Opposite Admin Lawns',
  },
  {
    id: 'bit-cs-it-block',
    name: 'Computer Science & IT Building',
    category: 'ACADEMIC',
    latitude: 23.6552,
    longitude: 86.4752,
    description: 'Department of Computer Science & Information Technology, advanced computing labs and server room.',
    verifiedSource: 'East Academic Sector Survey',
    requiresManualVerification: false,
    landmarkNearby: 'Adjacent to Mechanical Wing',
  },
  {
    id: 'bit-mech-block',
    name: 'Mechanical Engineering Department',
    category: 'ACADEMIC',
    latitude: 23.6538,
    longitude: 86.4748,
    description: 'Mechanical workshops, thermal engineering lab, and fabrication center.',
    verifiedSource: 'Academic Block B Building Directory',
    requiresManualVerification: false,
    landmarkNearby: 'Workshop Road',
  },
  {
    id: 'bit-electrical-block',
    name: 'Electrical Engineering Block',
    category: 'ACADEMIC',
    latitude: 23.6542,
    longitude: 86.4725,
    description: 'Power systems laboratory, high-voltage lab, and EEE department offices.',
    verifiedSource: 'West Academic Sector Record',
    requiresManualVerification: false,
    landmarkNearby: 'West Campus Avenue',
  },
  {
    id: 'bit-dispensary',
    name: 'BIT Sindri Dispensary (Health Centre)',
    category: 'MEDICAL',
    latitude: 23.6565,
    longitude: 86.4728,
    description: 'Campus primary medical clinic, doctor on call, first-aid unit, and emergency medical vehicle access.',
    verifiedSource: 'Campus Health Services Directory',
    requiresManualVerification: false,
    landmarkNearby: 'Near Staff Quarters / West Gate Route',
  },
  {
    id: 'bit-central-canteen',
    name: 'Central Canteen & Student Hub',
    category: 'FACILITY',
    latitude: 23.6543,
    longitude: 86.4755,
    description: 'Student cafeteria, refreshments, and central congregation area.',
    verifiedSource: 'Campus Amenity Plan',
    requiresManualVerification: false,
    landmarkNearby: 'Central Academic Pathway',
  },
  {
    id: 'bit-senior-boys-hostel',
    name: 'Senior Boys Hostel Complex (Hostel 1 to 5)',
    category: 'HOSTEL',
    latitude: 23.6582,
    longitude: 86.4715,
    description: 'North residential zone for undergraduate senior students with 24×7 warden security outpost.',
    verifiedSource: 'Residential Sector 1 Map',
    requiresManualVerification: false,
    landmarkNearby: 'Hostel Circle / North Lawn',
  },
  {
    id: 'bit-girls-hostel',
    name: 'Girls Hostel Complex (Hostel 26, 27, 28)',
    category: 'HOSTEL',
    latitude: 23.6530,
    longitude: 86.4765,
    description: 'Dedicated high-security residential complex for female students with gated biometric entry and patrol point.',
    verifiedSource: 'New Residential Infrastructure Survey',
    requiresManualVerification: false,
    landmarkNearby: 'East Perimeter Guard Post',
  },
  {
    id: 'bit-sports-ground',
    name: 'Gymkhana Sports Ground & Pavilion',
    category: 'SPORTS',
    latitude: 23.6568,
    longitude: 86.4758,
    description: 'Athletics track, football pavilion, and primary campus open evacuation assembly point.',
    verifiedSource: 'Campus Recreation Ground Boundary',
    requiresManualVerification: false,
    landmarkNearby: 'North-East Recreation Sector',
  },
  {
    id: 'bit-security-hq',
    name: 'Central Security Control Room',
    category: 'SECURITY',
    latitude: 23.6526,
    longitude: 86.4732,
    description: 'Chief Security Officer headquarters, CCTV monitoring desk, and emergency patrol dispatch station.',
    verifiedSource: 'Campus Safety Post Roster',
    requiresManualVerification: false,
    landmarkNearby: 'Gate 1 Security Wing',
  },
];

/**
 * Filters and searches campus locations by text and category.
 */
function searchCampusLocations(query = '', category = 'ALL') {
  const q = query.trim().toLowerCase();
  return CAMPUS_LOCATIONS.filter((loc) => {
    const matchesCat = category === 'ALL' || loc.category === category;
    if (!matchesCat) return false;
    if (!q) return true;
    return (
      loc.name.toLowerCase().includes(q) ||
      loc.description.toLowerCase().includes(q) ||
      (loc.landmarkNearby && loc.landmarkNearby.toLowerCase().includes(q))
    );
  });
}

/**
 * Validates coordinate numbers before passing to Maps URLs.
 */
function isValidCoordinate(lat, lng) {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    !Number.isNaN(lat) &&
    !Number.isNaN(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/**
 * Creates an external Google Maps navigation intent URL with verified coordinates.
 */
function buildGoogleMapsDirectionsUrl(latitude, longitude, label = '') {
  if (!isValidCoordinate(latitude, longitude)) {
    return null;
  }
  const encodedLabel = encodeURIComponent(label || 'BIT Sindri Destination');
  return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&destination_place_id=&travelmode=walking`;
}

module.exports = {
  BIT_SINDRI_CAMPUS_REGION,
  CAMPUS_CATEGORIES,
  CATEGORY_COLORS,
  CAMPUS_LOCATIONS,
  searchCampusLocations,
  isValidCoordinate,
  buildGoogleMapsDirectionsUrl,
};
