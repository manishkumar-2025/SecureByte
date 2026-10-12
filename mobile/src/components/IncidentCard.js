import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CATEGORY_META, radius, shadowCard, spacing, statusMeta } from '../theme';
import { useTheme } from '../hooks/useTheme';
import { PriorityBadge, StatusBadge } from './Badges';
import { shortId, timeAgo } from '../utils/format';

import PressableScale from './PressableScale';

/**
 * List row for an incident (My Reports + Responder Dashboard).
 * Fully tappable (onPress) with realistic status indicators and preview.
 */
export default function IncidentCard({ incident, showReporter = false, onPress }) {
  const c = useTheme();
  const cat = CATEGORY_META[incident.category] || { label: incident.category, icon: '📌' };

  const cardContent = (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: incident.isSos ? c.danger : c.border }, incident.isSos && shadowCard]}>
      <View style={styles.row}>
        <View style={[styles.iconWrap, { backgroundColor: incident.isSos ? c.dangerSoft : c.background }]}>
          <Text style={styles.icon}>{cat.icon}</Text>
        </View>
        <View style={styles.grow}>
          <View style={styles.titleRow}>
            {incident.isSos ? <Text style={[styles.sosTag, { backgroundColor: c.danger }]}>SOS</Text> : null}
            <Text style={[styles.title, { color: c.text }]} numberOfLines={1}>
              {incident.title}
            </Text>
          </View>
          <Text style={[styles.meta, { color: c.faint }]}>
            {cat.label} · #{shortId(incident.id)} · {timeAgo(incident.createdAt)}
            {showReporter && incident.reporter?.name ? ` · ${incident.reporter.name}` : ''}
          </Text>
          {incident.description ? (
            <Text style={[styles.snippet, { color: c.sub }]} numberOfLines={1}>
              {incident.description}
            </Text>
          ) : null}
          {incident.location?.campusLandmark ? (
            <Text style={[styles.landmark, { color: c.sub }]} numberOfLines={1}>
              📍 {incident.location.campusLandmark}
              {incident.location.buildingOrRoom ? ` (${incident.location.buildingOrRoom})` : ''}
            </Text>
          ) : null}
        </View>
        <View style={styles.badges}>
          <PriorityBadge priority={incident.priority} />
          <StatusBadge status={incident.status} />
        </View>
      </View>
      <View style={styles.cardFooter}>
        {incident.photoPath ? (
          <Text style={[styles.photoTag, { color: c.info, backgroundColor: c.infoSoft }]}>📷 Photo attached</Text>
        ) : <View />}
        {onPress ? (
          <Text style={[styles.tapHint, { color: c.primary }]}>View details →</Text>
        ) : null}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <PressableScale onPress={onPress} accessibilityLabel={`Open incident ${incident.title}`} style={{ width: '100%' }}>
        {cardContent}
      </PressableScale>
    );
  }

  return cardContent;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.l,
    borderWidth: 1,
    padding: spacing.l,
    marginBottom: spacing.m,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.m,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.m,
  },
  icon: { fontSize: 22 },
  grow: { flex: 1, marginRight: spacing.s },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  sosTag: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
    borderRadius: radius.xs,
    paddingHorizontal: 7,
    paddingVertical: 2,
    letterSpacing: 0.5,
  },
  title: { fontSize: 15.5, fontWeight: '700', flexShrink: 1, letterSpacing: -0.2 },
  meta: { fontSize: 12, marginTop: 4 },
  landmark: { fontSize: 12.5, marginTop: 4, fontWeight: '500' },
  badges: { alignItems: 'flex-end', gap: 6 },
  photoTag: {
    alignSelf: 'flex-start',
    fontSize: 11.5,
    fontWeight: '700',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  snippet: {
    fontSize: 13,
    marginTop: 5,
    lineHeight: 18,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.m,
    paddingTop: spacing.s,
    borderTopWidth: 1,
    borderTopColor: 'rgba(150, 150, 150, 0.08)',
  },
  tapHint: {
    fontSize: 12.5,
    fontWeight: '700',
  },
});
