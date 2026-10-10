// Domain constants shared by validators, controllers and tests.

// Categories students can pick in the manual report form.
const CLIENT_CATEGORIES = [
  'MEDICAL_EMERGENCY',
  'FIRE_HAZARD',
  'SECURITY_THREAT',
  'HARASSMENT',
  'FACILITY_CONCERN',
  'OTHER',
];

// SOS_ALERT is server-assigned for Emergency SOS alerts.
const ALL_CATEGORIES = [...CLIENT_CATEGORIES, 'SOS_ALERT'];

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
// CRITICAL is reserved for SOS alerts and cannot be set by clients.
const CLIENT_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'];

const STATUSES = ['NEW', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED'];

// Explicit, documented status lifecycle: New → Acknowledged → In Progress → Resolved.
const STATUS_TRANSITIONS = {
  NEW: ['ACKNOWLEDGED'],
  ACKNOWLEDGED: ['IN_PROGRESS'],
  IN_PROGRESS: ['RESOLVED'],
  RESOLVED: [],
};

const SEVERITIES = ['INFO', 'WARNING', 'CRITICAL'];

// ── v3 additions ──────────────────────────────────────────────
const CHECK_IN_STATUSES = ['SAFE', 'NEEDS_HELP'];

const SAFETY_POINT_CATEGORIES = [
  'EMERGENCY_EXIT',
  'FIRE_EXTINGUISHER',
  'AED',
  'FIRST_AID',
  'SHELTER',
  'SECURITY_OFFICE',
];

const NOTIFICATION_TYPES = [
  'SOS_ALERT',
  'NEW_INCIDENT',
  'STATUS_UPDATE',
  'CHECK_IN_ALERT',
  'ANNOUNCEMENT',
  'SYSTEM',
];

// Personal emergency-contact list cap (keeps the SOS contact-dialing
// flow fast and the UI uncluttered).
const MAX_CONTACTS = 5;

module.exports = {
  CLIENT_CATEGORIES,
  ALL_CATEGORIES,
  PRIORITIES,
  CLIENT_PRIORITIES,
  STATUSES,
  STATUS_TRANSITIONS,
  SEVERITIES,
  CHECK_IN_STATUSES,
  SAFETY_POINT_CATEGORIES,
  NOTIFICATION_TYPES,
  MAX_CONTACTS,
};
