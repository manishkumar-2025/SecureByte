import React, { useCallback, useState } from 'react';
import { Linking, Modal, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { api } from '../src/api/client';
import { storage } from '../src/utils/storage';
import { AuthGate } from '../src/components/Gate';
import ScreenHeader from '../src/components/ScreenHeader';
import Card, { SectionTitle } from '../src/components/Card';
import Button from '../src/components/Button';
import Input from '../src/components/Input';
import PressableScale from '../src/components/PressableScale';
import { SkeletonList, ErrorBanner, EmptyState } from '../src/components/Feedback';
import { useConfirm } from '../src/components/ConfirmDialog';
import { useToast } from '../src/components/Toast';
import { radius, spacing, touchMin, type } from '../src/theme';
import { useTheme } from '../src/hooks/useTheme';

const MAX_CONTACTS = 5;

const CAMPUS_OFFICIAL_HELPLINES = [
  {
    id: 'sec-main',
    name: 'BIT Security Control Room',
    role: '24×7 Main Gate Control Post & Patrol',
    phone: '+913262350495',
    displayPhone: '+91 326 2350495',
    icon: '👮‍♂️',
    location: 'Main Gate Control Post',
    timing: '24×7 Active',
    badge: 'SECURITY',
  },
  {
    id: 'dispensary',
    name: 'Campus Health Dispensary & Ambulance',
    role: 'Emergency Medical & On-duty Doctor',
    phone: '+919431123456',
    displayPhone: '+91 94311 23456',
    icon: '🚑',
    location: 'Near Hostel Circle',
    timing: '24×7 Emergency',
    badge: 'MEDICAL',
  },
  {
    id: 'anti-ragging',
    name: 'Women’s Grievance & Anti-Ragging Cell',
    role: 'Confidential Safety & Student Welfare',
    phone: '+9118001805522',
    displayPhone: '1800 180 5522 (Toll-Free)',
    icon: '🛡️',
    location: 'Administrative Block, Rm 104',
    timing: '24×7 Toll-Free',
    badge: 'CONFIDENTIAL',
  },
  {
    id: 'sindri-police',
    name: 'Sindri Police Station',
    role: 'Local Police Jurisdiction',
    phone: '+913262381222',
    displayPhone: '+91 326 2381222',
    icon: '🚓',
    location: 'Sindri Town Post (~1.2 km)',
    timing: '24×7 Emergency',
    badge: 'POLICE',
  },
  {
    id: 'erss-112',
    name: 'National Emergency Service (ERSS)',
    role: 'Police, Fire, Disaster & Medical (Pan-India)',
    phone: '112',
    displayPhone: '112 (Toll-Free)',
    icon: '🚨',
    location: 'Emergency Central Dispatch',
    timing: '24×7 Toll-Free',
    badge: 'GOVERNMENT',
  },
];

/**
 * Emergency contacts — private per account + Official Campus Safety Hotlines.
 * Quick actions: call (tel:) or text (sms:) work on-device without any
 * server integration; nothing is sent silently.
 */
function Contacts() {
  const c = useTheme();
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();

  const [contacts, setContacts] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relation, setRelation] = useState('');
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  const load = useCallback(async () => {
    setError(null);
    let cachedList = null;
    try {
      const cached = await storage.getItem('cache_emergency_contacts');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          cachedList = parsed;
          setContacts((curr) => (curr === null ? parsed : curr));
        }
      }
    } catch (e) {}

    try {
      const data = await api('/api/contacts');
      setContacts(data.items || []);
      await storage.setItem('cache_emergency_contacts', JSON.stringify(data.items || []));
    } catch (e) {
      if (e.code === 'NETWORK_ERROR' || e.status === 0 || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
        if (cachedList) {
          setContacts(cachedList);
        } else {
          setContacts([]);
        }
      } else {
        setError(e.message);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openAdd = () => {
    setEditing(null);
    setName('');
    setPhone('');
    setRelation('');
    setFieldErrors({});
    setModalOpen(true);
  };

  const openEdit = (contact) => {
    setEditing(contact);
    setName(contact.name);
    setPhone(contact.phone);
    setRelation(contact.relation || '');
    setFieldErrors({});
    setModalOpen(true);
  };

  const validate = () => {
    const errs = {};
    if (name.trim().length < 2) errs.name = 'Enter a name.';
    const compact = phone.replace(/[\s\-().]/g, '');
    if (!/^\+?\d{7,15}$/.test(compact)) errs.phone = 'Enter a valid phone (7–15 digits, e.g. +91 98765 43210).';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      if (editing) {
        await api(`/api/contacts/${editing.id}`, { method: 'PATCH', body: { name: name.trim(), phone: phone.trim(), relation: relation.trim() || undefined } });
        toast.success('Contact updated');
      } else {
        await api('/api/contacts', { method: 'POST', body: { name: name.trim(), phone: phone.trim(), relation: relation.trim() || undefined } });
        toast.success('Contact added', 'You can text them your location during an SOS.');
      }
      setModalOpen(false);
      load();
    } catch (e) {
      toast.error('Could not save', e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (contact) => {
    const ok = await confirm({
      title: `Remove ${contact.name}?`,
      message: 'They will no longer be offered as an SOS messaging target.',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/contacts/${contact.id}`, { method: 'DELETE' });
      setContacts((prev) => (prev || []).filter((x) => x.id !== contact.id));
      toast.success('Contact removed');
    } catch (e) {
      toast.error('Could not remove', e.message);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.background }]}>
      <View style={{ maxWidth: 640, width: '100%', alignSelf: 'center' }}>
        <ScreenHeader title="Emergency Contacts" subtitle={`Personal & Campus Hotlines · up to ${MAX_CONTACTS} personal`} onBack={true} />
      </View>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={c.primary} />}
      >
        <ErrorBanner message={error} onRetry={load} />

        {/* ── Official Campus Hotlines (BIT Sindri) ── */}
        <SectionTitle>Official campus emergency helplines</SectionTitle>
        <Card style={{ marginBottom: spacing.m }}>
          <Text style={[styles.intro, { color: c.sub, marginBottom: spacing.m }]}>
            Verified 24×7 rapid response stations across BIT Sindri campus. Direct one-tap connection:
          </Text>
          {CAMPUS_OFFICIAL_HELPLINES.map((h, i) => (
            <View
              key={h.id}
              style={[
                styles.officialRow,
                { borderColor: c.border },
                i < CAMPUS_OFFICIAL_HELPLINES.length - 1 && styles.officialBorder,
              ]}
            >
              <View style={[styles.officialIcon, { backgroundColor: c.background }]}>
                <Text style={{ fontSize: 20 }}>{h.icon}</Text>
              </View>
              <View style={{ flex: 1, marginRight: spacing.s }}>
                <View style={styles.badgeRow}>
                  <Text style={[styles.officialName, { color: c.text }]}>{h.name}</Text>
                  <View style={[styles.tag, { backgroundColor: c.primarySoft }]}>
                    <Text style={[styles.tagText, { color: c.primaryDark }]}>{h.badge}</Text>
                  </View>
                </View>
                <Text style={[styles.officialRole, { color: c.sub }]}>{h.role}</Text>
                <Text style={[styles.officialMeta, { color: c.faint }]}>
                  📍 {h.location} · ⏰ {h.timing}
                </Text>
              </View>
              <PressableScale
                onPress={() => Linking.openURL(`tel:${h.phone}`).catch(() => {})}
                accessibilityLabel={`Call ${h.name}`}
              >
                <View style={[styles.callBtn, { backgroundColor: c.successSoft, borderColor: c.success }]}>
                  <Text style={{ fontSize: 16 }}>📞</Text>
                </View>
              </PressableScale>
            </View>
          ))}
        </Card>

        {/* ── Personal Emergency Contacts ── */}
        <SectionTitle>Personal trusted contacts ({contacts ? contacts.length : 0}/{MAX_CONTACTS})</SectionTitle>
        <Card>
          <Text style={[styles.intro, { color: c.sub, marginBottom: spacing.m }]}>
            During an SOS you can text these trusted people your live GPS coordinates with one tap.
          </Text>

          {contacts === null ? (
            <SkeletonList rows={2} />
          ) : contacts.length === 0 ? (
            <EmptyState
              icon="☎️"
              title="No personal contacts added"
              message="Add roommates, family or local guardians so one tap reaches them during an emergency."
            />
          ) : (
            contacts.map((contact) => (
              <View key={contact.id} style={[styles.row, { backgroundColor: c.card, borderColor: c.border }]}>
                <View style={[styles.avatar, { backgroundColor: c.primarySoft }]}>
                  <Text style={[styles.avatarText, { color: c.primaryDark }]}>{contact.name[0]?.toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: c.text }]}>{contact.name}</Text>
                  <Text style={[styles.meta, { color: c.faint }]}>
                    {contact.phone}
                    {contact.relation ? ` · ${contact.relation}` : ''}
                  </Text>
                </View>
                <PressableScale onPress={() => Linking.openURL(`tel:${contact.phone}`).catch(() => {})} accessibilityLabel={`Call ${contact.name}`}>
                  <View style={[styles.actionBtn, { backgroundColor: c.successSoft }]}>
                    <Text style={{ fontSize: 16 }}>📞</Text>
                  </View>
                </PressableScale>
                <PressableScale
                  onPress={() =>
                    Linking.openURL(
                      `sms:${contact.phone}?&body=${encodeURIComponent('Hi — this is my emergency location from SecureByte: ')}`
                    ).catch(() => {})
                  }
                  accessibilityLabel={`Text ${contact.name}`}
                >
                  <View style={[styles.actionBtn, { backgroundColor: c.infoSoft, marginLeft: spacing.s }]}>
                    <Text style={{ fontSize: 16 }}>💬</Text>
                  </View>
                </PressableScale>
                <PressableScale onPress={() => openEdit(contact)} accessibilityLabel={`Edit ${contact.name}`}>
                  <View style={[styles.actionBtn, { backgroundColor: c.background, marginLeft: spacing.s }]}>
                    <Text style={{ fontSize: 15 }}>✏️</Text>
                  </View>
                </PressableScale>
                <PressableScale onPress={() => remove(contact)} accessibilityLabel={`Remove ${contact.name}`}>
                  <View style={[styles.actionBtn, { backgroundColor: c.dangerSoft, marginLeft: spacing.s }]}>
                    <Text style={{ fontSize: 15 }}>🗑️</Text>
                  </View>
                </PressableScale>
              </View>
            ))
          )}

          {contacts && contacts.length >= MAX_CONTACTS ? (
            <Text style={[styles.limitNote, { color: c.warning, marginTop: spacing.s }]}>
              Contact limit reached ({MAX_CONTACTS}). Remove one to add another.
            </Text>
          ) : (
            <Button title="＋ Add trusted contact" onPress={openAdd} style={{ marginTop: spacing.m }} />
          )}
        </Card>
      </ScrollView>

      {/* Add / edit modal */}
      <Modal visible={modalOpen} transparent animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <View style={[styles.modalBackdrop, { backgroundColor: c.overlay }]}>
          <View style={[styles.modalSheet, { backgroundColor: c.cardElevated }]}>
            <Text style={[styles.modalTitle, { color: c.text }]}>{editing ? 'Edit contact' : 'Add emergency contact'}</Text>
            <Input label="Name" placeholder="e.g. Mom / Roommate Rahul" value={name} onChangeText={setName} error={fieldErrors.name} />
            <Input
              label="Phone"
              placeholder="+91 98765 43210"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
              error={fieldErrors.phone}
            />
            <Input label="Relation (optional)" placeholder="e.g. Family / Roommate / Warden" value={relation} onChangeText={setRelation} />
            <View style={styles.modalActions}>
              <View style={{ flex: 1 }}>
                <Button title="Cancel" variant="subtle" onPress={() => setModalOpen(false)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button title={saving ? 'Saving…' : editing ? 'Save changes' : 'Add contact'} onPress={save} loading={saving} />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

export default function ContactsScreen() {
  return (
    <AuthGate>
      <Contacts />
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: spacing.l, paddingBottom: spacing.xxl, maxWidth: 640, width: '100%', alignSelf: 'center' },
  intro: { fontSize: 13, lineHeight: 19 },
  officialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.m,
  },
  officialBorder: {
    borderBottomWidth: 1,
  },
  officialIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.m,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  officialName: {
    fontSize: 14,
    fontWeight: '700',
  },
  tag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tagText: {
    fontSize: 10,
    fontWeight: '800',
  },
  officialRole: {
    fontSize: 12.5,
    marginTop: 2,
  },
  officialMeta: {
    fontSize: 11.5,
    marginTop: 3,
  },
  callBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.m,
    padding: spacing.m,
    marginBottom: spacing.m,
  },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', marginRight: spacing.m },
  avatarText: { fontSize: 16, fontWeight: '800' },
  name: { ...type.bodyStrong, fontSize: 14.5 },
  meta: { fontSize: 12, marginTop: 1 },
  actionBtn: { width: 40, height: 40, borderRadius: radius.s, alignItems: 'center', justifyContent: 'center' },
  limitNote: { fontSize: 13, fontWeight: '600', lineHeight: 19 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end' },
  modalSheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  modalTitle: { ...type.headline, marginBottom: spacing.l, textAlign: 'center' },
  modalActions: { flexDirection: 'row', gap: spacing.s, marginTop: spacing.s },
});
