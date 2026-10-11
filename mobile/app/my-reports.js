import React, { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { api } from '../src/api/client';
import { getPendingIncidents } from '../src/utils/outboxQueue';
import { storage } from '../src/utils/storage';
import { AuthGate } from '../src/components/Gate';
import ScreenHeader from '../src/components/ScreenHeader';
import IncidentCard from '../src/components/IncidentCard';
import ChipRow from '../src/components/ChipRow';
import Button from '../src/components/Button';
import PressableScale from '../src/components/PressableScale';
import { SkeletonList, EmptyState, ErrorBanner } from '../src/components/Feedback';
import { statusMeta, radius, spacing, type } from '../src/theme';
import { useTheme } from '../src/hooks/useTheme';

const CATEGORY_FILTERS = [
  { value: 'ALL', label: 'All Categories', icon: '📂' },
  { value: 'HARASSMENT', label: 'Anti-Ragging & Harassment', icon: '🛑' },
  { value: 'MEDICAL_EMERGENCY', label: 'Medical Emergencies', icon: '🚑' },
  { value: 'SECURITY_THREAT', label: 'Violence & Security', icon: '🚨' },
  { value: 'FIRE_HAZARD', label: 'Fire & Safety', icon: '🔥' },
  { value: 'FACILITY_CONCERN', label: 'Hostel & Infrastructure', icon: '🏠' },
  { value: 'OTHER', label: 'Other Reports', icon: '📌' },
];

function MyReports() {
  const c = useTheme();
  const router = useRouter();
  const sMeta = statusMeta(c);
  const FILTERS = [
    { value: null, label: 'All Status' },
    ...Object.entries(sMeta).map(([value, meta]) => ({ value, label: meta.label })),
  ];

  const [items, setItems] = useState(null);
  const [statusFilter, setStatusFilter] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const filterRef = useRef(statusFilter);
  filterRef.current = statusFilter;

  const load = useCallback(async (filter) => {
    const eff = filter !== undefined ? filter : filterRef.current;
    setError(null);

    // 1. Fetch pending local outbox queue
    let pendingItems = [];
    try {
      const pending = await getPendingIncidents();
      pendingItems = pending.map((q) => ({
        id: q.id,
        title: q.payload.title || (q.payload.isSos ? '🚨 Emergency SOS' : 'Incident Report'),
        description: q.payload.description,
        category: q.payload.category || (q.payload.isSos ? 'SECURITY_THREAT' : 'OTHER'),
        priority: q.payload.priority || (q.payload.isSos ? 'CRITICAL' : 'MEDIUM'),
        status: 'PENDING_OFFLINE_SYNC',
        createdAt: q.createdAt,
        location: q.payload.location,
        isSos: !!q.payload.isSos,
        isOfflineQueued: true,
      }));
    } catch (e) {}

    // 2. Read locally cached server reports
    let cachedList = [];
    try {
      const cached = await storage.getItem('cache_my_reports');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) cachedList = parsed;
      }
    } catch (e) {}

    // Apply immediate cache-first render if currently unpopulated
    setItems((curr) => {
      if (curr === null && (cachedList.length > 0 || pendingItems.length > 0)) {
        return [...pendingItems, ...cachedList];
      }
      return curr;
    });

    // 3. Query backend API if available
    try {
      const qs = eff ? `&status=${eff}` : '';
      const data = await api(`/api/incidents/my?limit=50&page=1${qs}`);
      const serverItems = data.items || [];
      setItems([...pendingItems, ...serverItems]);
      await storage.setItem('cache_my_reports', JSON.stringify(serverItems));
    } catch (e) {
      if (e.code === 'NETWORK_ERROR' || e.status === 0 || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
        // Safe offline fallback: keep cached items and pending outbox items
        setItems([...pendingItems, ...cachedList]);
      } else {
        setError(e.message);
        setItems(pendingItems);
      }
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

  const changeFilter = (value) => {
    setStatusFilter(value);
    load(value);
  };

  const medicalCount = useMemo(() => {
    return (items || []).filter((it) => it.category === 'MEDICAL_EMERGENCY').length;
  }, [items]);

  const activeCount = useMemo(() => {
    return (items || []).filter((it) => it.status === 'NEW' || it.status === 'IN_PROGRESS' || it.status === 'ACKNOWLEDGED').length;
  }, [items]);

  const filteredItems = useMemo(() => {
    if (!items) return null;
    let list = items;
    if (categoryFilter !== 'ALL') {
      list = list.filter((it) => it.category === categoryFilter);
    }
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (it) =>
        it.title?.toLowerCase().includes(q) ||
        it.description?.toLowerCase().includes(q) ||
        it.location?.campusLandmark?.toLowerCase().includes(q)
    );
  }, [items, search, categoryFilter]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.background }]}>
      <ScreenHeader
        title="My Reports"
        subtitle="Tap any report to view responder updates or edit details"
        onBack={true}
        right={
          <Pressable
            onPress={() => router.push('/report')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="File a new incident report"
          >
            <View style={[styles.newBtn, { backgroundColor: c.primarySoft, borderColor: c.primary }]}>
              <Text style={[styles.newBtnText, { color: c.primaryDark }]}>＋ New Report</Text>
            </View>
          </Pressable>
        }
      />
      <View style={[styles.topContainer, { maxWidth: 640, width: '100%', alignSelf: 'center' }]}>
        {/* Search input */}
        <View style={[styles.searchBox, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={{ fontSize: 15, marginRight: 8 }}>🔍</Text>
          <TextInput
            placeholder="Search reports by keyword, symptom or landmark…"
            placeholderTextColor={c.faint}
            value={search}
            onChangeText={setSearch}
            style={[styles.searchInput, { color: c.text }]}
            clearButtonMode="while-editing"
            autoCapitalize="none"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={10}>
              <Text style={{ fontSize: 14, color: c.faint }}>✕</Text>
            </Pressable>
          )}
        </View>

        {/* Status Filter */}
        <ChipRow options={FILTERS} value={statusFilter} onChange={changeFilter} />

        {/* Category Horizontal Pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.catScroll}
        >
          {CATEGORY_FILTERS.map((cat) => {
            const isSel = categoryFilter === cat.value;
            return (
              <PressableScale
                key={cat.value}
                onPress={() => setCategoryFilter(cat.value)}
                style={[
                  styles.catChip,
                  {
                    backgroundColor: isSel ? c.primary : c.card,
                    borderColor: isSel ? c.primary : c.border,
                  },
                ]}
              >
                <Text style={{ fontSize: 12, marginRight: 4 }}>{cat.icon}</Text>
                <Text
                  style={[
                    styles.catChipText,
                    { color: isSel ? c.onPrimary : c.text, fontWeight: isSel ? '700' : '500' },
                  ]}
                >
                  {cat.label}
                  {cat.value === 'MEDICAL_EMERGENCY' && items && medicalCount > 0 ? ` (${medicalCount})` : ''}
                </Text>
              </PressableScale>
            );
          })}
        </ScrollView>

        {/* Stats bar */}
        {items !== null && items.length > 0 && (
          <View style={[styles.statsBar, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={styles.statCell}>
              <Text style={[styles.statVal, { color: c.text }]}>{items.length}</Text>
              <Text style={[styles.statKey, { color: c.faint }]}>Total Reports</Text>
            </View>
            <View style={[styles.statDiv, { backgroundColor: c.border }]} />
            <PressableScale onPress={() => setCategoryFilter('MEDICAL_EMERGENCY')} style={styles.statCell}>
              <Text style={[styles.statVal, { color: '#DC2626' }]}>{medicalCount}</Text>
              <Text style={[styles.statKey, { color: c.faint }]}>Medical Reports</Text>
            </PressableScale>
            <View style={[styles.statDiv, { backgroundColor: c.border }]} />
            <View style={styles.statCell}>
              <Text style={[styles.statVal, { color: c.primary }]}>{activeCount}</Text>
              <Text style={[styles.statKey, { color: c.faint }]}>Active Cases</Text>
            </View>
          </View>
        )}

        <ErrorBanner message={error} onRetry={() => load()} />
      </View>

      {filteredItems === null ? (
        <View style={{ padding: spacing.l, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
          <SkeletonList rows={4} />
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, { maxWidth: 640, width: '100%', alignSelf: 'center' }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
          ListEmptyComponent={
            <EmptyState
              icon={categoryFilter === 'MEDICAL_EMERGENCY' ? '🚑' : '🗂️'}
              title={
                search.trim()
                  ? 'No matching reports'
                  : categoryFilter === 'MEDICAL_EMERGENCY'
                  ? 'No medical reports filed'
                  : statusFilter
                  ? `No ${sMeta[statusFilter]?.label.toLowerCase()} reports`
                  : 'No reports filed yet'
              }
              message={
                search.trim()
                  ? 'Try a different search keyword or clear the search filter.'
                  : categoryFilter === 'MEDICAL_EMERGENCY'
                  ? 'Any medical emergency cases filed with the campus dispensary will appear here.'
                  : 'Incidents and emergency SOS alerts you submit will appear here with live responder updates.'
              }
            >
              {!search.trim() && (
                <Button
                  title={categoryFilter === 'MEDICAL_EMERGENCY' ? 'Report a medical emergency' : 'Submit a safety report'}
                  variant="primary"
                  onPress={() => router.push('/report')}
                  style={{ marginTop: spacing.m }}
                />
              )}
            </EmptyState>
          }
          renderItem={({ item }) => (
            <IncidentCard incident={item} onPress={() => router.push(`/incident/${item.id}`)} />
          )}
        />
      )}
    </SafeAreaView>
  );
}

export default function MyReportsScreen() {
  return (
    <AuthGate>
      <MyReports />
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topContainer: { paddingHorizontal: spacing.l },
  list: { padding: 16, paddingBottom: 32 },
  newBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  newBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
    borderRadius: radius.m,
    borderWidth: 1,
    paddingHorizontal: spacing.m,
    marginBottom: spacing.s,
  },
  searchInput: {
    flex: 1,
    fontSize: 13.5,
    paddingVertical: 0,
  },
  catScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 6,
    marginBottom: spacing.s,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  catChipText: {
    fontSize: 12,
  },
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.m,
    borderWidth: 1,
    paddingVertical: 10,
    marginBottom: spacing.s,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
  },
  statVal: {
    fontSize: 18,
    fontWeight: '800',
  },
  statKey: {
    fontSize: 11,
    marginTop: 2,
  },
  statDiv: {
    width: 1,
    height: 28,
  },
});
