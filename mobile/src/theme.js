// ─────────────────────────────────────────────────────────────
// SecureByte design system v3 — "Aurora"
//
// Dual adaptive palettes (light + dark) that follow the OS setting,
// a typographic scale, spacing/radius tokens and domain metadata
// (status / priority / severity / category) defined per palette.
//
// Everything that renders colour receives its palette through the
// useTheme() hook (src/hooks/useTheme.js) — no component should
// hard-code hex values, so dark mode stays consistent app-wide.
// ─────────────────────────────────────────────────────────────

export const light = {
  isDark: false,
  // Brand — trust blue, tuned for outdoor/campus legibility
  primary: '#2A55E4',
  primaryDark: '#1D3FB0',
  primarySoft: '#E4EBFF',
  onPrimary: '#FFFFFF',
  // Danger / SOS
  danger: '#DC2626',
  dangerDark: '#991B1B',
  dangerSoft: '#FEE2E2',
  // Semantic
  success: '#15803D',
  successSoft: '#DCFCE7',
  warning: '#B45309',
  warningSoft: '#FEF3C7',
  info: '#0369A1',
  infoSoft: '#E0F2FE',
  purple: '#6D28D9',
  purpleSoft: '#EDE9FE',
  teal: '#0F766E',
  tealSoft: '#CCFBF1',
  // Surfaces
  background: '#F4F6FB',
  card: '#FFFFFF',
  cardElevated: '#FFFFFF',
  border: '#E4E8F1',
  borderStrong: '#C9D2E3',
  overlay: 'rgba(15, 23, 42, 0.45)',
  // Text
  text: '#101828',
  sub: '#4A5568',
  faint: '#8A94A6',
  onDanger: '#FFFFFF',
  skeleton: '#E9EDF5',
};

export const dark = {
  isDark: true,
  primary: '#7B96FF',
  primaryDark: '#5A78F0',
  primarySoft: '#1E2A4D',
  onPrimary: '#0B0E14',
  danger: '#F87171',
  dangerDark: '#EF4444',
  dangerSoft: '#3B1416',
  success: '#4ADE80',
  successSoft: '#12291B',
  warning: '#FBBF24',
  warningSoft: '#33260D',
  info: '#7DD3FC',
  infoSoft: '#0C2A3D',
  purple: '#A78BFA',
  purpleSoft: '#251C46',
  teal: '#2DD4BF',
  tealSoft: '#0B3330',
  // OLED-friendly true-dark surfaces
  background: '#0B0E14',
  card: '#151A23',
  cardElevated: '#1B2230',
  border: '#252D3D',
  borderStrong: '#38435A',
  overlay: 'rgba(0, 0, 0, 0.65)',
  text: '#F2F5FA',
  sub: '#A6B0C2',
  faint: '#67718A',
  onDanger: '#0B0E14',
  skeleton: '#222939',
};

export const palettes = { light, dark };

// ── Static tokens (colour-independent) ────────────────────────
export const spacing = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32, xxxl: 48 };
export const radius = { s: 10, m: 14, l: 20, xl: 28, pill: 999 };
export const touchMin = 48;

export const type = {
  display: { fontSize: 32, fontWeight: '800', letterSpacing: -0.8 },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  headline: { fontSize: 17, fontWeight: '700' },
  body: { fontSize: 15, fontWeight: '400' },
  bodyStrong: { fontSize: 15, fontWeight: '600' },
  caption: { fontSize: 12.5, fontWeight: '500' },
  micro: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
};

// Soft elevation for premium cards (Android: elevation; iOS: shadow).
export const shadowCard = {
  elevation: 2,
  shadowColor: '#0F172A',
  shadowOpacity: 0.06,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
};

// ── Domain metadata (palette-aware) ──────────────────────────
export function statusMeta(c) {
  return {
    NEW: { label: 'New', color: c.primary, bg: c.primarySoft },
    ACKNOWLEDGED: { label: 'Acknowledged', color: c.warning, bg: c.warningSoft },
    IN_PROGRESS: { label: 'In Progress', color: c.purple, bg: c.purpleSoft },
    RESOLVED: { label: 'Resolved', color: c.success, bg: c.successSoft },
    PENDING_OFFLINE_SYNC: { label: '⏳ Pending Sync', color: '#D97706', bg: '#FEF3C7' },
  };
}

export function priorityMeta(c) {
  return {
    CRITICAL: { label: 'Critical', color: c.onDanger, bg: c.danger },
    HIGH: { label: 'High', color: c.danger, bg: c.dangerSoft },
    MEDIUM: { label: 'Medium', color: c.primary, bg: c.primarySoft },
    LOW: { label: 'Low', color: c.sub, bg: c.border },
  };
}

export function severityMeta(c) {
  return {
    INFO: { label: 'Info', color: c.info, bg: c.infoSoft },
    WARNING: { label: 'Warning', color: c.warning, bg: c.warningSoft },
    CRITICAL: { label: 'Critical', color: c.onDanger, bg: c.danger },
  };
}

export const CATEGORY_META = {
  MEDICAL_EMERGENCY: { label: 'Medical Emergency', icon: '🚑' },
  FIRE_HAZARD: { label: 'Fire Hazard', icon: '🔥' },
  SECURITY_THREAT: { label: 'Security Threat', icon: '🚨' },
  HARASSMENT: { label: 'Harassment', icon: '🛡️' },
  FACILITY_CONCERN: { label: 'Facility Concern', icon: '🛠️' },
  OTHER: { label: 'Other', icon: '📌' },
  SOS_ALERT: { label: 'Emergency SOS', icon: '🆘' },
};

// Safety-point categories for the campus map screen.
export function safetyPointMeta(c) {
  return {
    EMERGENCY_EXIT: { label: 'Emergency Exit', icon: '🚪', color: c.success, bg: c.successSoft },
    FIRE_EXTINGUISHER: { label: 'Fire Extinguisher', icon: '🧯', color: c.danger, bg: c.dangerSoft },
    AED: { label: 'AED', icon: '❤️', color: c.danger, bg: c.dangerSoft },
    FIRST_AID: { label: 'First Aid', icon: '⛑️', color: c.primary, bg: c.primarySoft },
    SHELTER: { label: 'Shelter', icon: '🏠', color: c.purple, bg: c.purpleSoft },
    SECURITY_OFFICE: { label: 'Security Office', icon: '👮', color: c.info, bg: c.infoSoft },
  };
}

// Notification-center type → icon + palette tint.
export function notificationMeta(c) {
  return {
    SOS_ALERT: { icon: '🚨', color: c.danger, bg: c.dangerSoft },
    NEW_INCIDENT: { icon: '📝', color: c.primary, bg: c.primarySoft },
    STATUS_UPDATE: { icon: '🔄', color: c.purple, bg: c.purpleSoft },
    CHECK_IN_ALERT: { icon: '🆘', color: c.danger, bg: c.dangerSoft },
    ANNOUNCEMENT: { icon: '📢', color: c.info, bg: c.infoSoft },
    SYSTEM: { icon: '🔔', color: c.sub, bg: c.border },
  };
}
