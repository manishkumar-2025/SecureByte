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
    RESPONDER: { text: 'Responder', bg: c.primary },
    ADMIN: { text: 'Admin', bg: c.purple },
    STUDENT: { text: 'Student', bg: c.success },
  };
  const m = map[role] || { text: role, bg: c.success };
  return <Pill text={m.text} color="#FFFFFF" bg={m.bg} />;
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
    paddingVertical: 3,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
  },
  text: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.3 },
});
