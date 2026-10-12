import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { priorityMeta, severityMeta, statusMeta } from '../theme';
import { useTheme } from '../hooks/useTheme';

/** Small pill badges for status, priority, severity and role. */
export function StatusBadge({ status }) {
  const c = useTheme();
  const meta = statusMeta(c)[status] || { label: status, color: c.text, bg: c.border };
  return <Pill text={meta.label} color={meta.color} bg={meta.bg} />;
}

export function PriorityBadge({ priority }) {
  const c = useTheme();
  const meta = priorityMeta(c)[priority] || { label: priority, color: c.text, bg: c.border };
  return <Pill text={meta.label} color={meta.color} bg={meta.bg} />;
}

export function SeverityBadge({ severity }) {
  const c = useTheme();
  const meta = severityMeta(c)[severity] || { label: severity, color: c.text, bg: c.border };
  return <Pill text={meta.label} color={meta.color} bg={meta.bg} />;
}

export function RoleBadge({ role }) {
  const c = useTheme();
  const map = {
    STUDENT: { text: 'Student', bg: c.success },
    FACULTY: { text: 'Faculty / Prof', bg: '#0D9488' }, // teal
    WARDEN: { text: 'Hostel Warden', bg: '#D97706' }, // amber
    SECURITY: { text: 'Campus Security', bg: '#DC2626' }, // red
    STAFF: { text: 'College Staff', bg: '#4F46E5' }, // indigo
    SENSITIVE_OFFICER: { text: 'Grievance Officer', bg: '#7C3AED' }, // purple
    RESPONDER: { text: 'Safety Desk', bg: c.primary },
    ADMIN: { text: 'College Admin', bg: '#9333EA' },
    SYSTEM_ADMIN: { text: 'System Admin', bg: '#1E293B' },
  };
  const m = map[role] || { text: role || 'Student', bg: c.primary };
  return <Pill text={m.text} color="#FFFFFF" bg={m.bg} />;
}

export function VerificationBadge({ status }) {
  const c = useTheme();
  const normalized = (status || 'UNVERIFIED').toUpperCase();
  const map = {
    APPROVED: { text: '✓ Campus Verified', color: '#166534', bg: '#DCFCE7' },
    PENDING: { text: '⏳ Review Pending', color: '#92400E', bg: '#FEF3C7' },
    RESUBMIT_REQUIRED: { text: '⚠️ Action Required', color: '#B45309', bg: '#FFEDD5' },
    REJECTED: { text: '✕ Verification Rejected', color: '#991B1B', bg: '#FEE2E2' },
    UNVERIFIED: { text: '○ Unverified Account', color: c.muted, bg: c.surfaceAlt || c.border },
  };
  const m = map[normalized] || map.UNVERIFIED;
  return <Pill text={m.text} color={m.color} bg={m.bg} />;
}

export function Pill({ text, color, bg }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: 999,
    paddingVertical: 3.5,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
    borderWidth: 0.5,
    borderColor: 'rgba(0, 0, 0, 0.06)',
  },
  text: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.3 },
});
