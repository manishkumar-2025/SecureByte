import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { api } from '../src/api/client';
import { AuthGate } from '../src/components/Gate';
import ScreenHeader from '../src/components/ScreenHeader';
import Card from '../src/components/Card';
import Button from '../src/components/Button';
import ChipRow from '../src/components/ChipRow';
import PressableScale from '../src/components/PressableScale';
import { SkeletonList, ErrorBanner, EmptyState } from '../src/components/Feedback';
import { useToast } from '../src/components/Toast';
import { notificationMeta, radius, spacing, type } from '../src/theme';
import { useTheme } from '../src/hooks/useTheme';
import { timeAgo } from '../src/utils/format';

const FILTERS = [
  { value: '', label: 'All', icon: '🔔' },
  { value: 'SOS_ALERT', label: 'SOS', icon: '🚨' },
  { value: 'STATUS_UPDATE', label: 'Updates', icon: '🔄' },
  { value: 'CHECK_IN_ALERT', label: 'Check-ins', icon: '🆘' },
  { value: 'ANNOUNCEMENT', label: 'News', icon: '📢' },
];

/** Returns a display label for grouping notifications by date. */
function getDateGroup(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const itemDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (itemDay.getTime() === today.getTime()) return 'Today';
  if (itemDay.getTime() === yesterday.getTime()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * In-app notification center. Every alert the server generates
 * (SOS → staff, status changes → reporter, NEEDS_HELP check-ins →
 * staff, announcements → everyone) lands here — including when a
 * device was offline and the push never arrived.
 */
function Notifications() {
  const c = useTheme();
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [unread, setUnread] = useState(0);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const path = filter ? `/api/notifications?type=${filter}&limit=50` : '/api/notifications?limit=50';
      const data = await api(path);
      setItems(data.items);
      setUnread(data.unreadCount || 0);
    } catch (e) {
      setError(e.message);
    }
  }, [filter]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const markOne = async (n) => {
    if (n.readAt) return;
    // optimistic — badge drops immediately, server call is fire-and-forget
    setItems((prev) => (prev || []).map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
    setUnread((u) => Math.max(0, u - 1));
    try {
      await api(`/api/notifications/${n.id}/read`, { method: 'PATCH' });
    } catch (e) {
      load(); // revert on failure
    }
  };

  const markAll = async () => {
    try {
      await api('/api/notifications/read-all', { method: 'POST' });
      setItems((prev) => (prev || []).map((x) => ({ ...x, readAt: x.readAt || new Date().toISOString() })));
      setUnread(0);
      toast.success('All caught up', 'Every notification was marked as read.');
    } catch (e) {
      toast.error('Failed', e.message);
    }
  };

  const dismissOne = async (n) => {
    setDeletingId(n.id);
    // Optimistic remove
    setItems((prev) => (prev || []).filter((x) => x.id !== n.id));
    if (!n.readAt) setUnread((u) => Math.max(0, u - 1));
    try {
      await api(`/api/notifications/${n.id}/read`, { method: 'PATCH' });
    } catch (e) {
      // Not critical — dismiss was already done locally
    } finally {
      setDeletingId(null);
    }
  };

  // Build date-grouped sections
  const grouped = React.useMemo(() => {
    if (!items) return [];
    const groups = [];
    let lastLabel = null;
    for (const item of items) {
      const label = getDateGroup(item.createdAt);
      if (label !== lastLabel) {
        groups.push({ type: 'header', label });
        lastLabel = label;
      }
      groups.push({ type: 'item', data: item });
    }
    return groups;
  }, [items]);

  const totalCount = items?.length ?? 0;
  const readCount = items?.filter((x) => !!x.readAt).length ?? 0;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.background }]}>
      <View style={{ maxWidth: 640, width: '100%', alignSelf: 'center' }}>
        <ScreenHeader
          title="Notifications"
          subtitle={unread > 0 ? `${unread} unread` : 'All caught up'}
          onBack={true}
          right={
            unread > 0 ? (
              <Pressable onPress={markAll} accessibilityRole="button" accessibilityLabel="Mark all as read" hitSlop={8}>
                <Text style={[styles.markAll, { color: c.primary }]}>Read all</Text>
              </Pressable>
            ) : null
          }
        />
      </View>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={c.primary} />}
      >
        <ErrorBanner message={error} onRetry={load} />

        <ChipRow options={FILTERS} value={filter} onChange={setFilter} />

        {/* Stats summary banner */}
        {items !== null && totalCount > 0 && (
          <View style={[styles.statsBanner, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={styles.statItem}>
              <Text style={[styles.statNum, { color: c.text }]}>{totalCount}</Text>
              <Text style={[styles.statLabel, { color: c.faint }]}>Total</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: c.border }]} />
            <View style={styles.statItem}>
              <Text style={[styles.statNum, { color: c.danger }]}>{unread}</Text>
              <Text style={[styles.statLabel, { color: c.faint }]}>Unread</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: c.border }]} />
            <View style={styles.statItem}>
              <Text style={[styles.statNum, { color: c.success }]}>{readCount}</Text>
              <Text style={[styles.statLabel, { color: c.faint }]}>Read</Text>
            </View>
          </View>
        )}

        {items === null ? (
          <SkeletonList rows={4} />
        ) : items.length === 0 ? (
          <Card>
            <EmptyState icon="🔔" title="No notifications" message="Emergency alerts, status updates and announcements will appear here." />
          </Card>
        ) : (
          grouped.map((entry, idx) => {
            if (entry.type === 'header') {
              return (
                <View key={`header-${idx}`} style={styles.groupHeader}>
                  <View style={[styles.groupLine, { backgroundColor: c.border }]} />
                  <Text style={[styles.groupLabel, { color: c.faint, backgroundColor: c.background }]}>
                    {entry.label}
                  </Text>
                  <View style={[styles.groupLine, { backgroundColor: c.border }]} />
                </View>
              );
            }
            const n = entry.data;
            const m = notificationMeta(c)[n.type] || { icon: '🔔', color: c.sub, bg: c.border };
            const isUnread = !n.readAt;
            return (
              <PressableScale
                key={n.id}
                onPress={() => {
                  markOne(n);
                  if (n.incidentId) router.push(`/incident/${n.incidentId}`);
                }}
                accessibilityLabel={`${n.title}. ${n.body}`}
              >
                <View
                  style={[
                    styles.row,
                    {
                      backgroundColor: isUnread ? c.card : c.background,
                      borderColor: isUnread ? m.color : c.border,
                      borderLeftWidth: isUnread ? 3 : 1,
                    },
                  ]}
                >
                  <View style={[styles.iconWrap, { backgroundColor: m.bg }]}>
                    <Text style={{ fontSize: 18 }}>{m.icon}</Text>
                    {isUnread ? <View style={[styles.dot, { backgroundColor: m.color }]} /> : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.title, { color: c.text, fontWeight: isUnread ? '800' : '600' }]}>{n.title}</Text>
                    <Text style={[styles.body, { color: c.sub }]}>{n.body}</Text>
                    <View style={styles.metaRow}>
                      <Text style={[styles.time, { color: c.faint }]}>{timeAgo(n.createdAt)}</Text>
                      {n.incidentId && (
                        <Text style={[styles.incidentBadge, { color: c.primary, borderColor: c.primary }]}>
                          View incident →
                        </Text>
                      )}
                    </View>
                  </View>
                  {/* Dismiss button */}
                  <Pressable
                    onPress={() => dismissOne(n)}
                    hitSlop={10}
                    style={styles.dismissBtn}
                    accessibilityLabel="Dismiss notification"
                  >
                    <Text style={[styles.dismissText, { color: c.faint }]}>✕</Text>
                  </Pressable>
                </View>
              </PressableScale>
            );
          })
        )}

        {unread > 0 ? <Button title="Mark all as read" variant="subtle" onPress={markAll} style={{ marginTop: spacing.s }} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

export default function NotificationsScreen() {
  return (
    <AuthGate>
      <Notifications />
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: spacing.l, paddingBottom: spacing.xxl, maxWidth: 640, width: '100%', alignSelf: 'center' },
  markAll: { fontWeight: '800', fontSize: 13.5 },
  statsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.m,
    borderWidth: 1,
    marginBottom: spacing.m,
    paddingVertical: spacing.m,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 22, fontWeight: '900', letterSpacing: -0.4 },
  statLabel: { fontSize: 12, fontWeight: '600', marginTop: 3 },
  statDivider: { width: 1, height: 32 },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.s,
    marginTop: spacing.m,
    gap: spacing.s,
  },
  groupLine: { flex: 1, height: 1 },
  groupLabel: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: radius.l,
    padding: spacing.l,
    marginBottom: spacing.m,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.m,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.m,
  },
  dot: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  title: { ...type.bodyStrong, fontSize: 15, letterSpacing: -0.1 },
  body: { fontSize: 13.5, lineHeight: 19, marginTop: 3 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s, marginTop: 6 },
  time: { fontSize: 12 },
  incidentBadge: {
    fontSize: 11.5,
    fontWeight: '800',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
  },
  dismissBtn: {
    paddingLeft: spacing.s,
    justifyContent: 'center',
  },
  dismissText: { fontSize: 15, fontWeight: '700' },
});