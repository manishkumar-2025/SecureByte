import React, { useCallback, useMemo, useState } from 'react';
import { Linking, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { api } from '../src/api/client';
import { useAuth } from '../src/context/AuthContext';
import { AuthGate } from '../src/components/Gate';
import ScreenHeader from '../src/components/ScreenHeader';
import Card from '../src/components/Card';
import Input from '../src/components/Input';
import Button from '../src/components/Button';
import PressableScale from '../src/components/PressableScale';
import { SeverityBadge } from '../src/components/Badges';
import { LoadingScreen, EmptyState, ErrorBanner, SkeletonList } from '../src/components/Feedback';
import { useConfirm } from '../src/components/ConfirmDialog';
import { useToast } from '../src/components/Toast';
import { radius, spacing, touchMin, type } from '../src/theme';
import { useTheme } from '../src/hooks/useTheme';
import { formatDateTime, timeAgo } from '../src/utils/format';

const SEVERITIES = ['INFO', 'WARNING', 'CRITICAL'];

/** Safety Announcements — everyone reads & views rich modals; RESPONDER + ADMIN compose. */
function Announcements() {
  const { user } = useAuth();
  const c = useTheme();
  const toast = useToast();
  const confirm = useConfirm();
  const isStaff = user?.role === 'RESPONDER' || user?.role === 'ADMIN';

  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);
  const [search, setSearch] = useState('');

  const [composerOpen, setComposerOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [severity, setSeverity] = useState('INFO');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api('/api/announcements?limit=50&page=1');
      setItems(data.items);
    } catch (e) {
      setError(e.message);
      setItems([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openComposer = () => {
    setTitle('');
    setMessage('');
    setSeverity('INFO');
    setPostError(null);
    setFieldErrors({});
    setComposerOpen(true);
  };

  const post = async () => {
    const errs = {};
    if (title.trim().length < 5 || title.trim().length > 140) errs.title = 'Title must be 5–140 characters.';
    if (message.trim().length < 10 || message.trim().length > 2000) errs.message = 'Message must be 10–2000 characters.';
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const ok = await confirm({
      title: 'Publish this announcement?',
      message: 'Every student and staff member will be notified (in-app + push). Use CRITICAL only for genuine emergencies.',
      confirmLabel: 'Publish',
      danger: severity === 'CRITICAL',
    });
    if (!ok) return;

    setPosting(true);
    setPostError(null);
    try {
      await api('/api/responder/announcements', { method: 'POST', body: { title: title.trim(), message: message.trim(), severity } });
      setComposerOpen(false);
      toast.success('Announcement published', 'The campus has been notified.');
      await load();
    } catch (e) {
      setPostError(e.message);
    } finally {
      setPosting(false);
    }
  };

  const filteredItems = useMemo(() => {
    if (!items) return null;
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      (a) => a.title?.toLowerCase().includes(q) || a.message?.toLowerCase().includes(q)
    );
  }, [items, search]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.background }]}>
      <View style={{ maxWidth: 640, width: '100%', alignSelf: 'center' }}>
        <ScreenHeader
          title="Safety Announcements"
          subtitle={isStaff ? 'Campus safety bulletins & broadcasts' : 'Official broadcasts by campus safety desk'}
          onBack={true}
          right={
            isStaff ? (
              <Pressable onPress={openComposer} accessibilityRole="button" accessibilityLabel="New announcement" hitSlop={8}>
                <View style={[styles.newBtn, { backgroundColor: c.primarySoft, borderColor: c.primary }]}>
                  <Text style={[styles.newBtnText, { color: c.primaryDark }]}>＋ New Broadcast</Text>
                </View>
              </Pressable>
            ) : null
          }
        />

        <View style={{ paddingHorizontal: spacing.l }}>
          <View style={[styles.searchBox, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={{ fontSize: 15, marginRight: 8 }}>🔍</Text>
            <TextInput
              placeholder="Search campus announcements…"
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
        </View>
      </View>

      {filteredItems === null ? (
        <View style={{ padding: spacing.l }}>
          <SkeletonList rows={3} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
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
        >
          <ErrorBanner message={error} onRetry={load} />
          {filteredItems.length === 0 ? (
            <EmptyState
              icon="📢"
              title={search.trim() ? 'No matching announcements' : 'No announcements yet'}
              message={
                search.trim()
                  ? 'Try clearing the search query.'
                  : isStaff
                  ? 'Post the first campus safety announcement for all students.'
                  : 'Check back later for campus alerts.'
              }
            />
          ) : (
            filteredItems.map((a) => (
              <PressableScale
                key={a.id}
                onPress={() => setSelectedAnnouncement(a)}
                accessibilityLabel={`Open announcement: ${a.title}`}
              >
                <Card style={[styles.ann, a.severity === 'CRITICAL' && { borderColor: c.danger, borderWidth: 1.5 }]}>
                  <View style={styles.annHeader}>
                    <SeverityBadge severity={a.severity} />
                    <Text style={[styles.annTime, { color: c.faint }]}>{timeAgo(a.createdAt)}</Text>
                  </View>
                  <Text style={[styles.annTitle, { color: c.text }]}>{a.title}</Text>
                  <Text style={[styles.annMessage, { color: c.sub }]} numberOfLines={3}>
                    {a.message}
                  </Text>
                  <View style={styles.annFooter}>
                    <Text style={[styles.annMeta, { color: c.faint }]}>
                      — {a.author?.name || 'Campus Safety Desk'}, {formatDateTime(a.createdAt)}
                    </Text>
                    <Text style={[styles.annTap, { color: c.primary }]}>Tap to expand →</Text>
                  </View>
                </Card>
              </PressableScale>
            ))
          )}
        </ScrollView>
      )}

      {/* ── Announcement Detail Modal ── */}
      <Modal
        visible={!!selectedAnnouncement}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedAnnouncement(null)}
      >
        <View style={[styles.modalBackdrop, { backgroundColor: c.overlay }]}>
          <View style={[styles.modalSheet, { backgroundColor: c.cardElevated }]}>
            {selectedAnnouncement && (
              <>
                <View style={styles.modalTopRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <SeverityBadge severity={selectedAnnouncement.severity} />
                    <View style={[styles.officialTag, { backgroundColor: c.primarySoft }]}>
                      <Text style={[styles.officialTagText, { color: c.primaryDark }]}>OFFICIAL CAMPUS ADVISORY</Text>
                    </View>
                  </View>
                  <Pressable onPress={() => setSelectedAnnouncement(null)} hitSlop={10}>
                    <Text style={{ fontSize: 18, color: c.faint, fontWeight: '700' }}>✕</Text>
                  </Pressable>
                </View>

                <Text style={[styles.modalTitle, { color: c.text }]}>{selectedAnnouncement.title}</Text>
                <Text style={[styles.modalMeta, { color: c.faint }]}>
                  Broadcasted by {selectedAnnouncement.author?.name || 'Campus Safety Directorate'} · {formatDateTime(selectedAnnouncement.createdAt)}
                </Text>

                <ScrollView style={{ maxHeight: 250, marginVertical: spacing.m }}>
                  <Text style={[styles.modalBody, { color: c.text }]}>{selectedAnnouncement.message}</Text>
                </ScrollView>

                <View style={[styles.modalActionCard, { backgroundColor: c.card, borderColor: c.border }]}>
                  <Text style={[styles.actionCardTitle, { color: c.primary }]}>🛡️ Recommended Campus Actions:</Text>
                  <Text style={[styles.actionCardText, { color: c.sub }]}>
                    • Familiarize yourself with emergency exits and rally points.
                  </Text>
                  <Text style={[styles.actionCardText, { color: c.sub }]}>
                    • Comply with responder instructions across campus zones.
                  </Text>
                  <Text style={[styles.actionCardText, { color: c.sub }]}>
                    • In case of immediate distress, use the SOS button or contact the desk below.
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 10, marginTop: spacing.m }}>
                  <Button
                    title="📞 Call Control Desk"
                    variant="primary"
                    style={{ flex: 1 }}
                    onPress={() => {
                      Linking.openURL('tel:+913262350495').catch(() => {});
                      setSelectedAnnouncement(null);
                    }}
                  />
                  <Button
                    title="Close"
                    variant="subtle"
                    style={{ flex: 1 }}
                    onPress={() => setSelectedAnnouncement(null)}
                  />
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Staff composer */}
      <Modal visible={composerOpen} animationType="slide" onRequestClose={() => setComposerOpen(false)}>
        <SafeAreaView style={[styles.safe, { backgroundColor: c.background }]}>
          <ScreenHeader title="New announcement" onBack={() => setComposerOpen(false)} />
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <ErrorBanner message={postError} />
            <Input label="Title" placeholder="e.g. Fire drill on Friday at 11:00 AM" value={title} onChangeText={setTitle} error={fieldErrors.title} maxLength={140} />
            <Input
              label="Message"
              placeholder="What should students know and do? Specify locations, instructions and contacts."
              value={message}
              onChangeText={setMessage}
              error={fieldErrors.message}
              multiline
              style={styles.multiline}
              maxLength={2000}
            />
            <Text style={[styles.sevLabel, { color: c.text }]}>Severity</Text>
            <View style={styles.sevRow}>
              {SEVERITIES.map((s) => {
                const active = severity === s;
                return (
                  <PressableScale key={s} onPress={() => setSeverity(s)} accessibilityRole="button" accessibilityState={{ selected: active }}>
                    <View
                      style={[
                        styles.sevChip,
                        { backgroundColor: active ? c.primarySoft : c.card, borderColor: active ? c.primary : c.border },
                      ]}
                    >
                      <Text style={[styles.sevText, { color: active ? c.primaryDark : c.sub }]}>{s}</Text>
                    </View>
                  </PressableScale>
                );
              })}
            </View>
            <Button title={posting ? 'Publishing…' : '📢 Publish announcement'} onPress={post} loading={posting} disabled={posting} />
            <Text style={[styles.note, { color: c.faint }]}>
              Every student and staff member receives this broadcast in their notification center. Push notifications are dispatched immediately.
            </Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

export default function AnnouncementsScreen() {
  return (
    <AuthGate>
      <Announcements />
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: spacing.l, paddingBottom: spacing.xxl, maxWidth: 640, width: '100%', alignSelf: 'center' },
  newBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  newBtnText: { fontWeight: '800', fontSize: 12.5 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 46,
    borderRadius: radius.l,
    borderWidth: 1.2,
    paddingHorizontal: spacing.l,
    marginBottom: spacing.s,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  ann: { marginBottom: spacing.m, borderRadius: radius.l },
  annHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  annTime: { fontSize: 12 },
  annTitle: { ...type.headline, fontSize: 17, marginTop: spacing.s, letterSpacing: -0.2 },
  annMessage: { fontSize: 14, lineHeight: 21, marginTop: 6 },
  annFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.m,
    paddingTop: spacing.s,
    borderTopWidth: 1,
    borderTopColor: 'rgba(150, 150, 150, 0.08)',
  },
  annMeta: { fontSize: 12, flex: 1 },
  annTap: { fontSize: 12.5, fontWeight: '800', marginLeft: 8 },
  multiline: { minHeight: 120 },
  sevLabel: { ...type.bodyStrong, fontSize: 14, marginBottom: 8 },
  sevRow: { flexDirection: 'row', gap: spacing.s, marginBottom: spacing.l },
  sevChip: {
    flex: 1,
    minHeight: touchMin - 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.m,
    borderWidth: 1.5,
    paddingHorizontal: spacing.l,
  },
  sevText: { fontSize: 13, fontWeight: '700' },
  note: { fontSize: 12.5, textAlign: 'center', marginTop: spacing.m, lineHeight: 18 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end' },
  modalSheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  modalTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.m },
  officialTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  officialTagText: { fontSize: 10, fontWeight: '800' },
  modalTitle: { ...type.headline, fontSize: 19, lineHeight: 26 },
  modalMeta: { fontSize: 12, marginTop: 4 },
  modalBody: { fontSize: 14.5, lineHeight: 23 },
  modalActionCard: { padding: 12, borderRadius: radius.m, borderWidth: 1, marginTop: spacing.s },
  actionCardTitle: { fontSize: 12.5, fontWeight: '800', marginBottom: 4 },
  actionCardText: { fontSize: 12.5, lineHeight: 18, marginTop: 2 },
});
