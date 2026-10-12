import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { api } from '../src/api/client';
import { useAuth } from '../src/context/AuthContext';
import { AuthGate, StaffGate } from '../src/components/Gate';
import ScreenHeader from '../src/components/ScreenHeader';
import IncidentCard from '../src/components/IncidentCard';
import ChipRow from '../src/components/ChipRow';
import SegmentedTabs from '../src/components/SegmentedTabs';
import StatCard from '../src/components/StatCard';
import Input from '../src/components/Input';
import Button from '../src/components/Button';
import Card, { SectionTitle } from '../src/components/Card';
import { EmptyState, ErrorBanner, SkeletonList } from '../src/components/Feedback';
import { RoleBadge, VerificationBadge } from '../src/components/Badges';
import { statusMeta, priorityMeta, CATEGORY_META, radius, spacing, type } from '../src/theme';
import { useTheme } from '../src/hooks/useTheme';
import { timeAgo } from '../src/utils/format';

const STATUS_FILTERS = [{ value: null, label: 'All' }, { value: 'NEW', label: 'New' }, { value: 'ACKNOWLEDGED', label: 'Acknowledged' }, { value: 'IN_PROGRESS', label: 'In Progress' }, { value: 'RESOLVED', label: 'Resolved' }];
const PRIORITY_FILTERS = [{ value: null, label: 'All' }, { value: 'CRITICAL', label: 'Critical' }, { value: 'HIGH', label: 'High' }, { value: 'MEDIUM', label: 'Medium' }, { value: 'LOW', label: 'Low' }];
const CATEGORY_FILTERS = [
  { value: null, label: 'All' },
  ...Object.entries(CATEGORY_META)
    .filter(([k]) => k !== 'SOS_ALERT')
    .map(([v, m]) => ({ value: v, label: `${m.icon} ${m.label}` })),
];

/**
 * Staff console (RESPONDER + ADMIN) with tabs:
 *   Queue         — live incident queue (SOS first), search + filters
 *   Analytics     — real aggregated statistics from /api/responder/analytics
 *   Verifications — ADMIN only: campus verification queue & approval controls
 *   Users         — ADMIN only: campus user directory
 */
function Dashboard() {
  const { user } = useAuth();
  const c = useTheme();
  const router = useRouter();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SYSTEM_ADMIN';

  const tabs = [
    { value: 'queue', label: 'Queue', icon: '🚨' },
    { value: 'analytics', label: 'Analytics', icon: '📊' },
    ...(isAdmin ? [
      { value: 'verifications', label: 'Verify', icon: '🎓' },
      { value: 'users', label: 'Users', icon: '👥' },
    ] : []),
  ];
  const [tab, setTab] = useState('queue');

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.background }]}>
      <View style={{ maxWidth: 820, width: '100%', alignSelf: 'center' }}>
        <ScreenHeader
          title="Safety Console"
          subtitle={`Signed in as ${user?.name || 'staff'} · ${isAdmin ? 'Admin' : 'Responder'}`}
          right={
            <Pressable
              onPress={() => router.push('/profile')}
              accessibilityRole="button"
              accessibilityLabel="Open profile and settings"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={{ padding: 4 }}
            >
              <Text style={{ fontSize: 20 }}>⚙️</Text>
            </Pressable>
          }
        />
        <View style={{ paddingHorizontal: spacing.l, paddingBottom: spacing.m }}>
          <SegmentedTabs tabs={tabs} value={tab} onChange={setTab} />
        </View>
      </View>
      {tab === 'queue' ? (
        <QueueTab />
      ) : tab === 'analytics' ? (
        <AnalyticsTab />
      ) : tab === 'verifications' ? (
        <VerificationsTab />
      ) : (
        <UsersTab />
      )}
    </SafeAreaView>
  );
}

// ── Tab 1: incident queue ─────────────────────────────────────
function QueueTab() {
  const c = useTheme();
  const router = useRouter();
  const [items, setItems] = useState(null);
  const [filters, setFilters] = useState({ status: null, priority: null, category: null });
  const [search, setSearch] = useState('');
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Refs keep `load` identity-stable so useFocusEffect never re-fires on
  // keystrokes or filter changes — loading happens ONLY on focus or on an
  // explicit user action (filter tap, search submit, pull-to-refresh).
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const searchRef = useRef(search);
  searchRef.current = search;

  const load = useCallback(async (f, q) => {
    const effFilters = f || filtersRef.current;
    const effSearch = q !== undefined ? q : searchRef.current;
    setError(null);
    try {
      const params = new URLSearchParams();
      if (effFilters.status) params.set('status', effFilters.status);
      if (effFilters.priority) params.set('priority', effFilters.priority);
      if (effFilters.category) params.set('category', effFilters.category);
      if (effSearch.trim()) params.set('q', effSearch.trim());
      params.set('limit', '50');
      params.set('page', '1');
      const data = await api(`/api/responder/incidents?${params.toString()}`);
      setItems(data.items);
    } catch (e) {
      setError(e.message);
      setItems([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(filters);
      const interval = setInterval(() => {
        load(filters);
      }, 5000);
      return () => clearInterval(interval);
    }, [load, filters])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const setFilter = (key) => (value) => {
    const next = { ...filters, [key]: value };
    setFilters(next);
    load(next);
  };

  const counts = (items || []).reduce(
    (acc, i) => {
      acc.total += 1;
      if (i.status === 'NEW') acc.new += 1;
      if (i.isSos) acc.sos += 1;
      if (i.status === 'IN_PROGRESS') acc.active += 1;
      return acc;
    },
    { total: 0, new: 0, sos: 0, active: 0 }
  );

  return (
    <FlatList
      data={items || []}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
      ListHeaderComponent={
        <View>
          <View style={styles.statsRow}>
            <StatCard icon="📋" tint="primary" label={search.trim() ? 'Matches' : 'In view'} value={counts.total} />
            <StatCard icon="🆕" tint="warning" label="New" value={counts.new} />
            <StatCard icon="🆘" tint="danger" label="SOS" value={counts.sos} />
          </View>

          <Input
            label="Search the queue"
            placeholder="Title, landmark, room or reporter name…"
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={() => load(filters, search)}
            returnKeyType="search"
          />

          <Text style={[styles.filterLabel, { color: c.faint }]}>Status</Text>
          <ChipRow options={STATUS_FILTERS} value={filters.status} onChange={setFilter('status')} />
          <Text style={[styles.filterLabel, { color: c.faint }]}>Priority</Text>
          <ChipRow options={PRIORITY_FILTERS} value={filters.priority} onChange={setFilter('priority')} />
          <Text style={[styles.filterLabel, { color: c.faint }]}>Category</Text>
          <ChipRow options={CATEGORY_FILTERS} value={filters.category} onChange={setFilter('category')} />

          <ErrorBanner message={error} onRetry={() => load()} />
        </View>
      }
      ListEmptyComponent={
        items === null ? (
          <SkeletonList rows={4} />
        ) : (
          <EmptyState icon="✅" title="No incidents match" message="Try clearing a filter or the search box, or pull down to refresh." />
        )
      }
      renderItem={({ item }) => <IncidentCard incident={item} showReporter onPress={() => router.push(`/incident/${item.id}`)} />}
    />
  );
}

// ── Tab 2: analytics (real aggregated data) ───────────────────
function AnalyticsTab() {
  const c = useTheme();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api('/api/responder/analytics'));
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (error) return <View style={styles.tabPad}><ErrorBanner message={error} onRetry={load} /></View>;
  if (!data) return <View style={styles.tabPad}><SkeletonList rows={4} /></View>;

  const sMeta = statusMeta(c);
  const maxDay = Math.max(1, ...data.series7d.map((d) => d.total));

  return (
    <FlatList
      ListHeaderComponent={<View />}
      data={[]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
      contentContainerStyle={styles.list}
      ListFooterComponent={
        <View>
          <View style={styles.statsRow}>
            <StatCard icon="📋" tint="primary" label="Total incidents" value={data.totals.incidents} />
            <StatCard icon="⏱️" tint="warning" label="Last 24 h" value={data.totals.last24h} />
            <StatCard icon="🆘" tint="danger" label="SOS 24 h" value={data.totals.sosLast24h} />
          </View>
          <View style={[styles.statsRow, { marginTop: spacing.m }]}>
            <StatCard icon="🚧" tint="purple" label="Open now" value={data.totals.openNow} />
            <StatCard
              icon="✅"
              tint="success"
              label="Avg resolution (min)"
              value={data.avgResolutionMinutes ?? '—'}
            />
            <StatCard icon="🫂" tint="info" label="Check-ins 24 h" value={data.checkInsLast24h.safe + data.checkInsLast24h.needsHelp} />
          </View>

          <SectionTitle>Last 7 days</SectionTitle>
          <Card>
            <View style={styles.chart}>
              {data.series7d.map((d) => (
                <View key={d.date} style={styles.barCol}>
                  <Text style={[styles.barValue, { color: c.sub }]}>{d.total > 0 ? d.total : ''}</Text>
                  <View style={[styles.bar, { backgroundColor: c.border }]}>
                    <View
                      style={{
                        height: `${(d.total / maxDay) * 100}%`,
                        width: '100%',
                        borderRadius: 4,
                        backgroundColor: c.primary,
                        minHeight: d.total > 0 ? 4 : 0,
                      }}
                    />
                  </View>
                  <Text style={[styles.barLabel, { color: c.faint }]}>{d.date.slice(5)}</Text>
                </View>
              ))}
            </View>
            <Text style={[styles.chartNote, { color: c.faint }]}>Daily incident counts (UTC days, campus timezone may differ).</Text>
          </Card>

          <SectionTitle>By status</SectionTitle>
          <Card>
            {Object.keys(sMeta).map((k) => {
              const count = data.byStatus[k] || 0;
              const pct = data.totals.incidents > 0 ? Math.round((count / data.totals.incidents) * 100) : 0;
              return (
                <View key={k} style={styles.distRow}>
                  <Text style={[styles.distLabel, { color: c.sub, minWidth: 96 }]}>{sMeta[k].label}</Text>
                  <View style={[styles.distTrack, { backgroundColor: c.border }]}>
                    <View style={{ width: `${pct}%`, backgroundColor: sMeta[k].color, height: '100%', borderRadius: 4, minHeight: 6 }} />
                  </View>
                  <Text style={[styles.distValue, { color: c.text, minWidth: 30, textAlign: 'right' }]}>{count}</Text>
                </View>
              );
            })}
          </Card>

          <SectionTitle>By category</SectionTitle>
          <Card>
            {Object.entries(data.byCategory).length === 0 ? (
              <Text style={[styles.chartNote, { color: c.faint }]}>No incidents yet.</Text>
            ) : (
              Object.entries(data.byCategory).map(([k, v]) => (
                <View key={k} style={styles.distRow}>
                  <Text style={[styles.distLabel, { color: c.sub, minWidth: 150, flex: 1 }]}>
                    {CATEGORY_META[k]?.icon || '📌'} {CATEGORY_META[k]?.label || k}
                  </Text>
                  <Text style={[styles.distValue, { color: c.text }]}>{v}</Text>
                </View>
              ))
            )}
          </Card>
        </View>
      }
    />
  );
}

// ── Tab 3: campus verification queue (ADMIN only) ─────────────
const VERIFICATION_STATUS_FILTERS = [
  { value: null, label: 'All' },
  { value: 'PENDING', label: '⏳ Pending' },
  { value: 'RESUBMIT_REQUIRED', label: '⚠️ Resubmit' },
  { value: 'APPROVED', label: '✓ Approved' },
  { value: 'REJECTED', label: '✕ Rejected' },
];

function VerificationsTab() {
  const c = useTheme();
  const [items, setItems] = useState(null);
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [search, setSearch] = useState('');
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const statusRef = useRef(statusFilter);
  statusRef.current = statusFilter;
  const searchRef = useRef(search);
  searchRef.current = search;

  const load = useCallback(async (st, q) => {
    const effStatus = st !== undefined ? st : statusRef.current;
    const effSearch = q !== undefined ? q : searchRef.current;
    setError(null);
    try {
      const params = new URLSearchParams();
      if (effStatus) params.set('status', effStatus);
      if (effSearch && effSearch.trim()) params.set('q', effSearch.trim());
      params.set('limit', '50');
      const data = await api(`/api/admin/verifications?${params.toString()}`);
      setItems(data.items);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleReview = async (userItem, action, reason) => {
    setActionLoading(userItem.id);
    setActionSuccess(null);
    setError(null);
    try {
      await api(`/api/admin/verifications/${userItem.id}/review`, {
        method: 'POST',
        body: {
          action,
          rejectionReason: reason || undefined,
        },
      });
      setActionSuccess(`${userItem.name}: marked ${action}`);
      // Refresh list
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setActionLoading(null);
    }
  };

  const confirmApprove = (userItem) => {
    Alert.alert(
      'Approve Campus Credentials?',
      `Approve ${userItem.name} and promote to ${userItem.requestedRole || 'STUDENT'} with full campus role permissions?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Approve & Unlock', onPress: () => handleReview(userItem, 'APPROVE') },
      ]
    );
  };

  const confirmResubmit = (userItem) => {
    Alert.alert(
      'Request Resubmission?',
      `Ask ${userItem.name} to resubmit valid college credentials/ID proof?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Request Resubmit',
          onPress: () => handleReview(userItem, 'RESUBMIT', 'Please verify your college ID proof and resubmit with official credentials.'),
        },
      ]
    );
  };

  const confirmReject = (userItem) => {
    Alert.alert(
      'Reject Verification?',
      `Reject verification application for ${userItem.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: () => handleReview(userItem, 'REJECT', 'Submitted credentials could not be verified against institutional records.'),
        },
      ]
    );
  };

  return (
    <FlatList
      data={items || []}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
          tintColor={c.primary}
        />
      }
      ListHeaderComponent={
        <View style={{ marginBottom: spacing.m }}>
          <Input
            placeholder="Search by name, email, roll no, dept..."
            value={search}
            onChangeText={(t) => {
              setSearch(t);
              load(statusFilter, t);
            }}
            style={{ marginBottom: spacing.m }}
          />

          <ChipRow
            options={VERIFICATION_STATUS_FILTERS}
            value={statusFilter}
            onChange={(v) => {
              setStatusFilter(v);
              load(v, search);
            }}
          />

          {actionSuccess ? (
            <View style={[styles.successBanner, { backgroundColor: '#DCFCE7', borderColor: '#86EFAC' }]}>
              <Text style={{ color: '#166534', fontWeight: '700', fontSize: 13 }}>✓ {actionSuccess}</Text>
            </View>
          ) : null}

          {error ? <ErrorBanner message={error} onRetry={() => load(statusFilter, search)} /> : null}
        </View>
      }
      ListEmptyComponent={
        items === null ? (
          <SkeletonList rows={4} />
        ) : (
          <EmptyState
            icon="🎓"
            title="No verification requests"
            description={
              statusFilter === 'PENDING'
                ? 'All campus verification requests have been triaged!'
                : 'No accounts match the current filter.'
            }
          />
        )
      }
      renderItem={({ item }) => {
        const isBusy = actionLoading === item.id;
        return (
          <View style={[styles.vCard, { backgroundColor: c.card, borderColor: c.border }]}>
            {/* Header: Name, badges */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.s, marginBottom: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.vName, { color: c.text }]}>{item.name}</Text>
                <Text style={[styles.vEmail, { color: c.sub }]}>
                  {item.email} {item.phone ? `· ${item.phone}` : ''}
                </Text>
              </View>
              <VerificationBadge status={item.verificationStatus} />
            </View>

            {/* Role transitions */}
            <View style={styles.roleTransitionRow}>
              <Text style={[styles.vMetaLabel, { color: c.faint }]}>Current:</Text>
              <RoleBadge role={item.role} />
              <Text style={{ color: c.faint, fontWeight: '800', marginHorizontal: 4 }}>→</Text>
              <Text style={[styles.vMetaLabel, { color: c.faint }]}>Requested:</Text>
              <RoleBadge role={item.requestedRole || item.role} />
            </View>

            {/* Credential Details Grid */}
            <View style={[styles.vDetailsBox, { backgroundColor: c.surfaceAlt || '#F8FAFC', borderColor: c.border }]}>
              {item.studentId ? (
                <Text style={[styles.vDetailText, { color: c.text }]}>
                  <Text style={{ fontWeight: '700' }}>Student ID: </Text>
                  {item.studentId}
                  {item.enrollmentNo ? ` (Reg: ${item.enrollmentNo})` : ''}
                </Text>
              ) : null}

              {item.department ? (
                <Text style={[styles.vDetailText, { color: c.text }]}>
                  <Text style={{ fontWeight: '700' }}>Department: </Text>
                  {item.department}
                  {item.designation ? ` (${item.designation})` : ''}
                </Text>
              ) : null}

              {item.course ? (
                <Text style={[styles.vDetailText, { color: c.text }]}>
                  <Text style={{ fontWeight: '700' }}>Course: </Text>
                  {item.course}
                  {item.yearOrSemester ? ` • ${item.yearOrSemester}` : ''}
                </Text>
              ) : null}

              {item.residencyType || item.hostelName ? (
                <Text style={[styles.vDetailText, { color: c.text }]}>
                  <Text style={{ fontWeight: '700' }}>Hostel/Residency: </Text>
                  {item.hostelName || item.residencyType}
                  {item.roomOrOffice ? ` (Room/Office: ${item.roomOrOffice})` : ''}
                </Text>
              ) : null}

              {item.guardBadgeId ? (
                <Text style={[styles.vDetailText, { color: c.text }]}>
                  <Text style={{ fontWeight: '700' }}>Badge ID: </Text>
                  {item.guardBadgeId}
                  {item.assignedZone ? ` • Zone: ${item.assignedZone}` : ''}
                  {item.shift ? ` • Shift: ${item.shift}` : ''}
                </Text>
              ) : null}

              {item.gender ? (
                <Text style={[styles.vDetailText, { color: c.sub }]}>
                  <Text style={{ fontWeight: '700' }}>Gender: </Text>
                  {item.gender}
                </Text>
              ) : null}

              {item.rejectionReason ? (
                <View style={[styles.reasonNote, { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' }]}>
                  <Text style={{ color: '#991B1B', fontSize: 12, fontWeight: '600' }}>
                    Note: {item.rejectionReason}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Quick Actions */}
            <View style={styles.vActionsRow}>
              {item.verificationStatus !== 'APPROVED' ? (
                <Pressable
                  onPress={() => confirmApprove(item)}
                  disabled={isBusy}
                  style={[styles.vApproveBtn, { opacity: isBusy ? 0.6 : 1 }]}
                >
                  <Text style={styles.vApproveBtnText}>✓ Approve</Text>
                </Pressable>
              ) : null}

              {item.verificationStatus !== 'RESUBMIT_REQUIRED' ? (
                <Pressable
                  onPress={() => confirmResubmit(item)}
                  disabled={isBusy}
                  style={[styles.vResubmitBtn, { borderColor: '#F59E0B', opacity: isBusy ? 0.6 : 1 }]}
                >
                  <Text style={[styles.vResubmitBtnText, { color: '#B45309' }]}>⚠️ Resubmit</Text>
                </Pressable>
              ) : null}

              {item.verificationStatus !== 'REJECTED' ? (
                <Pressable
                  onPress={() => confirmReject(item)}
                  disabled={isBusy}
                  style={[styles.vRejectBtn, { borderColor: '#EF4444', opacity: isBusy ? 0.6 : 1 }]}
                >
                  <Text style={[styles.vRejectBtnText, { color: '#DC2626' }]}>✕ Reject</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        );
      }}
    />
  );
}

// ── Tab 4: user directory (ADMIN only) ────────────────────────
function UsersTab() {
  const c = useTheme();
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api('/api/admin/users?limit=50');
      setUsers(data.items);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <FlatList
      data={users || []}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={c.primary} />}
      ListHeaderComponent={error ? <ErrorBanner message={error} onRetry={load} /> : null}
      ListEmptyComponent={users === null ? <SkeletonList rows={4} /> : <EmptyState icon="👥" title="No users found" />}
      renderItem={({ item }) => (
        <View style={[styles.userRow, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={[styles.userAvatar, { backgroundColor: c.primarySoft }]}>
            <Text style={[styles.userAvatarText, { color: c.primaryDark }]}>{item.name[0]?.toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.userName, { color: c.text }]}>{item.name}</Text>
            <Text style={[styles.userMeta, { color: c.faint }]}>
              {item.email} · {item._count?.incidentsReported ?? 0} report(s)
            </Text>
          </View>
          <RoleBadge role={item.role} />
        </View>
      )}
    />
  );
}

export default function DashboardScreen() {
  return (
    <AuthGate>
      <StaffGate>
        <Dashboard />
      </StaffGate>
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  list: { padding: spacing.l, paddingBottom: spacing.xxl, maxWidth: 820, width: '100%', alignSelf: 'center' },
  tabPad: { padding: spacing.l, maxWidth: 820, width: '100%', alignSelf: 'center' },
  statsRow: { flexDirection: 'row', gap: spacing.s, marginBottom: spacing.s },
  filterLabel: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: spacing.m, marginBottom: 8 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.s, height: 140 },
  barCol: { flex: 1, alignItems: 'center' },
  bar: { width: '100%', height: 90, borderRadius: radius.xs, justifyContent: 'flex-end', overflow: 'hidden' },
  barValue: { fontSize: 11.5, fontWeight: '800', marginBottom: 4 },
  barLabel: { fontSize: 11, fontWeight: '600', marginTop: 6 },
  chartNote: { fontSize: 12, marginTop: spacing.m, fontStyle: 'italic', lineHeight: 17 },
  distRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.m },
  distTrack: { flex: 1, height: 10, borderRadius: 5, marginHorizontal: spacing.m, overflow: 'hidden' },
  distLabel: { fontSize: 13, fontWeight: '600' },
  distValue: { fontSize: 14, fontWeight: '800' },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.l,
    padding: spacing.l,
    marginBottom: spacing.m,
  },
  userAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginRight: spacing.m },
  userAvatarText: { fontSize: 16, fontWeight: '800' },
  userName: { ...type.bodyStrong, fontSize: 15 },
  userMeta: { fontSize: 12.5, marginTop: 2 },
  successBanner: {
    borderWidth: 1,
    borderRadius: radius.m,
    paddingVertical: spacing.s,
    paddingHorizontal: spacing.m,
    marginBottom: spacing.m,
  },
  vCard: {
    borderWidth: 1,
    borderRadius: radius.l,
    padding: spacing.l,
    marginBottom: spacing.m,
  },
  vName: { ...type.bodyStrong, fontSize: 16 },
  vEmail: { fontSize: 13, marginTop: 2 },
  roleTransitionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: spacing.s,
  },
  vMetaLabel: { fontSize: 12, fontWeight: '600' },
  vDetailsBox: {
    borderWidth: 1,
    borderRadius: radius.m,
    padding: spacing.m,
    gap: 4,
    marginBottom: spacing.m,
  },
  vDetailText: { fontSize: 13, lineHeight: 18 },
  reasonNote: {
    borderWidth: 1,
    borderRadius: radius.s,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginTop: 4,
  },
  vActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    flexWrap: 'wrap',
  },
  vApproveBtn: {
    backgroundColor: '#16A34A',
    borderRadius: radius.m,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vApproveBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  vResubmitBtn: {
    borderWidth: 1,
    backgroundColor: '#FFFBEB',
    borderRadius: radius.m,
    paddingVertical: 7,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vResubmitBtnText: { fontWeight: '700', fontSize: 13 },
  vRejectBtn: {
    borderWidth: 1,
    backgroundColor: '#FEF2F2',
    borderRadius: radius.m,
    paddingVertical: 7,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vRejectBtnText: { fontWeight: '700', fontSize: 13 },
});
