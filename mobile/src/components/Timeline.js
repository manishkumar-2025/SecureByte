import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { radius, spacing, statusMeta } from '../theme';
import { useTheme } from '../hooks/useTheme';
import { formatDateTime } from '../utils/format';

/**
 * Vertical timeline of IncidentStatusHistory entries:
 * previousStatus → newStatus, with responder notes and timestamp.
 */
export default function Timeline({ history = [] }) {
  const c = useTheme();
  const meta = statusMeta(c);

  if (history.length === 0) {
    return <Text style={[styles.none, { color: c.sub }]}>No status updates yet — your report is waiting for a responder to acknowledge it.</Text>;
  }

  const reversed = [...history].reverse(); // newest first
  return (
    <View>
      {reversed.map((h, index) => {
        const m = meta[h.newStatus] || { color: c.primary, label: h.newStatus };
        return (
          <View key={h.id} style={styles.row}>
            <View style={styles.rail}>
              <View style={[styles.dot, { backgroundColor: m.color }]} />
              {index < reversed.length - 1 ? <View style={[styles.line, { backgroundColor: c.border }]} /> : null}
            </View>
            <View style={styles.body}>
              <Text style={[styles.transition, { color: c.text }]}>
                {label(meta, h.previousStatus)} <Text style={{ color: c.faint }}>→</Text>{' '}
                <Text style={{ color: m.color, fontWeight: '800' }}>{label(meta, h.newStatus)}</Text>
              </Text>
              <Text style={[styles.meta, { color: c.faint }]}>
                {formatDateTime(h.createdAt)}
                {h.updater?.name ? `  ·  by ${h.updater.name}` : ''}
              </Text>
              {h.responderNotes ? (
                <Text style={[styles.notes, { color: c.sub, backgroundColor: c.background, borderRadius: radius.s, padding: spacing.s, marginTop: 6 }]}>
                  “{h.responderNotes}”
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function label(meta, status) {
  return meta[status]?.label || status;
}

const styles = StyleSheet.create({
  none: { fontSize: 13.5, lineHeight: 20 },
  row: { flexDirection: 'row' },
  rail: { alignItems: 'center', width: 18, marginRight: spacing.m },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  line: { width: 2, flex: 1, marginVertical: 2 },
  body: { flex: 1, paddingBottom: spacing.l },
  transition: { fontSize: 14.5, fontWeight: '700' },
  meta: { fontSize: 12, marginTop: 2 },
  notes: { fontSize: 13.5, fontStyle: 'italic', lineHeight: 19 },
});
