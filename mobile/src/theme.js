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
  // Brand — vivid indigo/ultramarine tuned for outdoor/campus legibility
  primary: '#2563EB',
  primaryDark: '#1D4ED8',
  primarySoft: '#EFF6FF',
  onPrimary: '#FFFFFF',
  // Danger / SOS — high-urgency crimson
  danger: '#EF4444',
  dangerDark: '#B91C1C',
  dangerSoft: '#FEE2E2',
  onDanger: '#FFFFFF',
  // Semantic
  success: '#10B981',
  successSoft: '#D1FAE5',
  warning: '#F59E0B',
  warningSoft: '#FEF3C7',
  info: '#0284C7',
  infoSoft: '#E0F2FE',
  purple: '#8B5CF6',
  purpleSoft: '#EDE9FE',
  teal: '#0D9488',
  tealSoft: '#CCFBF1',
  // Modern Slate/Zinc Surfaces
  background: '#F8FAFC',
  card: '#FFFFFF',
  cardElevated: '#FFFFFF',
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',
  overlay: 'rgba(15, 23, 42, 0.55)',
  // Text
  text: '#0F172A',
  sub: '#475569',
  faint: '#94A3B8',
  skeleton: '#E2E8F0',
};

export const dark = {
  isDark: true,
  // Brand — radiant cobalt
  primary: '#60A5FA',
  primaryDark: '#3B82F6',
  primarySoft: '#1E293B',
  onPrimary: '#0B0F19',
  // Danger / SOS
  danger: '#F87171',
  dangerDark: '#EF4444',
  dangerSoft: '#37181A',
  onDanger: '#0B0F19',
  // Semantic
  success: '#34D399',
  successSoft: '#064E3B',
  warning: '#FBBF24',
  warningSoft: '#451A03',
  info: '#38BDF8',
  infoSoft: '#0C4A6E',
  purple: '#A78BFA',
  purpleSoft: '#2E1065',
  teal: '#2DD4BF',
  tealSoft: '#134E4A',
  // Deep space OLED surfaces
  background: '#090D16',
  card: '#131A29',
  cardElevated: '#1A2234',
  border: '#222D42',
  borderStrong: '#334155',
  overlay: 'rgba(0, 0, 0, 0.75)',
  text: '#F8FAFC',
  sub: '#94A3B8',
  faint: '#64748B',
  skeleton: '#1E293B',
};

export const palettes = { light, dark };

// ── Static tokens (colour-independent) ────────────────────────
export const spacing = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32, xxxl: 48 };
export const radius = { xs: 6, s: 10, m: 14, l: 18, xl: 24, xxl: 32, pill: 999 };
export const touchMin = 48;

export const type = {
  display: { fontSize: 32, fontWeight: '800', letterSpacing: -0.8 },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  headline: { fontSize: 17, fontWeight: '700' },
  body: { fontSize: 15, fontWeight: '400' },
  bodyStrong: { fontSize: 15, fontWeight: '600' },
  caption: { fontSize: 13, fontWeight: '500' },
  micro: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
};

// Polished multi-tier shadows
export const shadowCard = {
  elevation: 3,
  shadowColor: '#0F172A',
  shadowOpacity: 0.08,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
};

export const shadowSubtle = {
  elevation: 1,
  shadowColor: '#0F172A',
  shadowOpacity: 0.04,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 2 },
};

export const shadowGlow = (color) => ({
  elevation: 8,
  shadowColor: color || '#EF4444',
  shadowOpacity: 0.4,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 6 },
});

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
