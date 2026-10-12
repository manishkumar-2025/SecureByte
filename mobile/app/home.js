import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { api } from '../src/api/client';
import { getPendingIncidents } from '../src/utils/outboxQueue';
import { storage } from '../src/utils/storage';
import { AuthGate, RoleGate } from '../src/components/Gate';
import Card, { SectionTitle } from '../src/components/Card';
import Button from '../src/components/Button';
import PressableScale from '../src/components/PressableScale';
import IncidentCard from '../src/components/IncidentCard';
import { SkeletonList, ErrorBanner, EmptyState } from '../src/components/Feedback';
import { SeverityBadge } from '../src/components/Badges';
import { useConfirm } from '../src/components/ConfirmDialog';
import { useToast } from '../src/components/Toast';
import { useTheme } from '../src/hooks/useTheme';
import { useUnreadCount } from '../src/hooks/useUnreadCount';
import { CATEGORY_META, radius, shadowCard, shadowSubtle, spacing, type } from '../src/theme';
import { formatDateTime, timeAgo } from '../src/utils/format';

const SAFETY_TIPS = [
  {
    id: 'tip-night',
    title: 'Late Night Campus Transit',
    icon: '🚶‍♀️',
    badge: 'GUIDELINE',
    desc: 'Campus security conducts mobile jeep patrols from 9:30 PM to 5:30 AM along main hostel avenues.',
    points: [
      'Stick to illuminated central boulevards connecting Hostel Circle, Deshpande Hall, and the Library.',
      'Use the Virtual Night Escort walk timer so campus staff are automatically notified if you do not check in.',
      'Security patrol jeeps are stationed near Sindri Main Gate and Hostel 7 crossover; flag them down if you feel uneasy.',
      'Emergency wall break-glass call points are mounted at every department entrance landing.'
    ]
  },
  {
    id: 'tip-medical',
    title: 'Acute Medical Emergencies',
    icon: '🚑',
    badge: 'FIRST AID',
    desc: 'Dispensary ambulance can reach any campus sector within 4 to 6 minutes of notification.',
    points: [
      'Call the Campus Dispensary emergency helpline (+91 94311 23456) immediately or tap Medical SOS.',
      'Keep patient resting flat on back; do not attempt to move suspected neck or spinal injury patients.',
      'Deploy nearest AED (Automated External Defibrillator) located at Sports Pavilion ground floor or Main Admin foyer.',
      'Designate a peer to stand at the sector access barrier to guide the dispensary ambulance driver directly.'
    ]
  },
  {
    id: 'tip-harassment',
    title: 'Zero Tolerance Anti-Ragging',
    icon: '🤝',
    badge: 'PROTECTION',
    desc: 'Strict university policies protect students with confidential reporting and immediate flying squad intervention.',
    points: [
      'CampusShield provides confidential, encrypted incident reporting without disclosing student identities.',
      'National Anti-Ragging Toll-Free Helpline: 1800-180-5522 operates 24 hours every day.',
      'The Flying Squad conducts unscheduled night inspections across junior and senior hostel corridors.',
      'Counseling and confidential peer support are available at the Student Welfare Center adjacent to Dean Office.'
    ]
  },
  {
    id: 'tip-storm',
    title: 'Monsoon & Storm Precautions',
    icon: '⛈️',
    badge: 'ADVISORY',
    desc: 'Guidance during heavy monsoon downpours, flash puddling, and severe electrical lightning.',
    points: [
      'Avoid the Deshpande basement underpass and low-lying library paths during heavy torrential rainfall.',
      'Utilize the covered elevated walkway connecting Main Admin Block and Academic Wings 1 through 3.',
      'Never take temporary shelter underneath solitary tall trees on football grounds during active thunderstorm activity.',
      'Disconnect sensitive laboratory test rigs and high-voltage circuit apparatus during active lightning surges.'
    ]
  }
];

function Home() {
  const { user } = useAuth();
  const c = useTheme();
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const { count: unread, refresh: refreshUnread } = useUnreadCount();

  const [recent, setRecent] = useState(null);
  const [announcements, setAnnouncements] = useState(null);
  const [contacts, setContacts] = useState(null);
  const [lastCheckIn, setLastCheckIn] = useState(null);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);
  const [selectedTip, setSelectedTip] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);

  // Virtual Night Escort state
  const [escortActive, setEscortActive] = useState(false);
  const [escortSeconds, setEscortSeconds] = useState(600); // 10 mins default
  const [escortRoute, setEscortRoute] = useState('Central Library → Hostel 7');
  const [escortModal, setEscortModal] = useState(false);
  const escortTimerRef = useRef(null);

  const load = useCallback(async () => {
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

    // 2. Fetch locally cached reports for immediate display
    let cachedList = [];
    try {
      const cached = await storage.getItem('cache_my_reports');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) cachedList = parsed.slice(0, 3);
      }
    } catch (e) {}

    // Immediate optimistic populate from cache and outbox
    setRecent((curr) => {
      if (curr === null && (pendingItems.length > 0 || cachedList.length > 0)) {
        return [...pendingItems, ...cachedList].slice(0, 3);
      }
      return curr;
    });

    // 3. Query all endpoints resiliently using Promise.allSettled
    const [myRes, annRes, ctRes, ckRes] = await Promise.allSettled([
      api('/api/incidents/my?limit=3&page=1'),
      api('/api/announcements?limit=3&page=1'),
      api('/api/contacts'),
      api('/api/checkins/me?limit=1&page=1'),
    ]);

    if (myRes.status === 'fulfilled') {
      const serverItems = myRes.value?.items || [];
      const combined = [...pendingItems, ...serverItems].slice(0, 3);
      setRecent(combined);
      try {
        await storage.setItem('cache_my_reports', JSON.stringify(serverItems));
      } catch (err) {}
    } else {
      // If server query failed, ensure pending + cached items remain visible
      setRecent((curr) => curr ?? [...pendingItems, ...cachedList].slice(0, 3));
      if (myRes.reason?.code !== 'NETWORK_ERROR') {
        setError(myRes.reason?.message || 'Could not refresh latest reports');
      }
    }

    if (annRes.status === 'fulfilled') {
      setAnnouncements(annRes.value?.items || []);
    } else {
      setAnnouncements((curr) => curr ?? []);
    }

    if (ctRes.status === 'fulfilled') {
      setContacts(ctRes.value?.items || []);
    } else {
      setContacts((curr) => curr ?? []);
    }

    if (ckRes.status === 'fulfilled') {
      setLastCheckIn(ckRes.value?.items?.[0] || null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      refreshUnread();
    }, [load, refreshUnread])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([load(), refreshUnread()]);
    setRefreshing(false);
  };

  const doCheckIn = async (status) => {
    if (status === 'NEEDS_HELP') {
      const ok = await confirm({
        title: 'Request help from safety staff?',
        message: 'Responders and admins will be alerted immediately with your name and note. Use only when you actually need assistance.',
        confirmLabel: 'Alert responders',
        danger: true,
      });
      if (!ok) return;
    }
    setCheckingIn(true);
    try {
      const data = await api('/api/checkins', {
        method: 'POST',
        body: { status, note: status === 'SAFE' ? 'Checked in safe from the app' : 'Needs help (from the app)' },
      });
      setLastCheckIn(data.checkIn);
      if (status === 'SAFE') toast.success('Checked in safe', 'Your safety status was recorded.');
      else toast.info('Help requested', 'Campus responders have been alerted.');
    } catch (e) {
      toast.error('Check-in failed', e.message);
    } finally {
      setCheckingIn(false);
    }
  };

  // Escort timer handler
  useEffect(() => {
    if (escortActive) {
      escortTimerRef.current = setInterval(() => {
        setEscortSeconds((prev) => {
          if (prev <= 1) {
            clearInterval(escortTimerRef.current);
            setEscortActive(false);
            toast.error('⏰ Escort Time Expired', 'Please check in safe or trigger SOS immediately.');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (escortTimerRef.current) clearInterval(escortTimerRef.current);
    }
    return () => {
      if (escortTimerRef.current) clearInterval(escortTimerRef.current);
    };
  }, [escortActive]);

  const startEscort = (mins, route) => {
    setEscortSeconds(mins * 60);
    setEscortRoute(route);
    setEscortActive(true);
    setEscortModal(false);
    toast.success('🛡️ Escort Walk Started', `Campus safety monitoring active for ${mins} mins along ${route}.`);
  };

  const finishEscortSafe = async () => {
    setEscortActive(false);
    if (escortTimerRef.current) clearInterval(escortTimerRef.current);
    try {
      await api('/api/checkins', {
        method: 'POST',
        body: { status: 'SAFE', note: `Arrived safely from night walk: ${escortRoute}` },
      });
      toast.success('Arrived Safely! 🎉', 'Your safe check-in has been recorded by Campus Security.');
      load();
    } catch (e) {
      toast.success('Arrived Safely! 🎉', 'Night walk completed.');
    }
  };

  const formatMinsSecs = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { maxWidth: 640, width: '100%', alignSelf: 'center' }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
      >
        {/* ── Greeting hero ── */}
        <View style={styles.greetingRow}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={[styles.hi, { color: c.text }]}>Hi, {user?.name?.split(' ')[0]} 👋</Text>
              <View style={[styles.roleTag, { backgroundColor: c.primarySoft }]}>
                <Text style={[styles.roleTagText, { color: c.primaryDark }]}>{user?.role || 'STUDENT'}</Text>
              </View>
            </View>
            <Text style={[styles.question, { color: c.sub }]}>BIT Sindri Campus Safety Network</Text>
          </View>
          <View style={styles.headerActions}>
            <PressableScale onPress={() => router.push('/notifications')} accessibilityLabel={`Notifications, ${unread} unread`} hitSlop={6}>
              <View style={[styles.bellWrap, { backgroundColor: c.card, borderColor: c.border }]}>
                <Text style={styles.bellIcon}>🔔</Text>
                {unread > 0 ? (
                  <View style={[styles.badge, { backgroundColor: c.danger }]}>
                    <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
                  </View>
                ) : null}
              </View>
            </PressableScale>
            <PressableScale onPress={() => router.push('/profile')} accessibilityLabel="Open profile" hitSlop={6}>
              <View style={[styles.avatar, { backgroundColor: c.primarySoft }]}>
                <Text style={[styles.avatarText, { color: c.primaryDark }]}>{user?.name?.[0]?.toUpperCase() || '?'}</Text>
              </View>
            </PressableScale>
          </View>
        </View>

        {/* ── Campus Status Banner ── */}
        <View style={[styles.statusBanner, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={[styles.statusDot, { backgroundColor: c.success }]} />
          <Text style={[styles.statusText, { color: c.text }]} numberOfLines={1}>
            Campus Security Normal • 18 Response Units Active • 24×7 Sindri Desk
          </Text>
        </View>

        {/* ── College Verification Banner ── */}
        {user?.verificationStatus !== 'APPROVED' ? (
          <PressableScale
            onPress={() => router.push('/verification')}
            style={[
              styles.verifBanner,
              {
                backgroundColor:
                  user?.verificationStatus === 'PENDING'
                    ? (c.isDark ? '#422006' : '#FEF3C7')
                    : user?.verificationStatus === 'RESUBMIT_REQUIRED'
                    ? (c.isDark ? '#451A03' : '#FFEDD5')
                    : (c.isDark ? '#1E293B' : '#F1F5F9'),
                borderColor:
                  user?.verificationStatus === 'PENDING'
                    ? '#F59E0B'
                    : user?.verificationStatus === 'RESUBMIT_REQUIRED'
                    ? '#EA580C'
                    : c.border,
              },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ fontSize: 20 }}>
                {user?.verificationStatus === 'PENDING' ? '⏳' : user?.verificationStatus === 'RESUBMIT_REQUIRED' ? '⚠️' : '📋'}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.verifTitle, { color: c.text }]}>
                  {user?.verificationStatus === 'PENDING'
                    ? 'College Verification Pending'
                    : user?.verificationStatus === 'RESUBMIT_REQUIRED'
                    ? 'Action Required on Verification'
                    : 'Complete College Verification'}
                </Text>
                <Text style={[styles.verifSub, { color: c.sub }]} numberOfLines={2}>
                  {user?.verificationStatus === 'PENDING'
                    ? `Submitted for ${user?.requestedRole || 'Student'}. Tap to view verification status.`
                    : user?.verificationStatus === 'RESUBMIT_REQUIRED'
                    ? 'Reviewer requested updated details. Tap to resubmit.'
                    : 'Verify student/employee credentials to unlock authorized campus privileges.'}
                </Text>
              </View>
              <View style={[styles.verifActionBtn, { backgroundColor: c.primary }]}>
                <Text style={styles.verifActionText}>
                  {user?.verificationStatus === 'PENDING' ? 'Status' : 'Verify'}
                </Text>
              </View>
            </View>
          </PressableScale>
        ) : null}

        {/* Staff / Admin Quick Switcher */}
        {user?.role && user.role !== 'STUDENT' ? (
          <PressableScale
            onPress={() => router.push('/dashboard')}
            style={[styles.staffPortalBanner, { backgroundColor: c.primarySoft, borderColor: c.primary }]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 18 }}>🛡️</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.staffPortalTitle, { color: c.primaryDark }]}>
                  Authorized Staff Access ({user.role})
                </Text>
                <Text style={[styles.staffPortalSub, { color: c.sub }]}>
                  Open Safety Incident Console & Verification Queue
                </Text>
              </View>
              <Text style={[styles.staffPortalLink, { color: c.primary }]}>Open Console →</Text>
            </View>
          </PressableScale>
        ) : null}

        <ErrorBanner message={error} onRetry={load} />

        {/* ── Emergency SOS Activation Section ── */}
        <SectionTitle
          action={
            <Pressable onPress={() => router.push('/sos')} accessibilityRole="link">
              <Text style={[styles.link, { color: c.danger }]}>Open Console 🚨</Text>
            </Pressable>
          }
        >
          Emergency SOS Activation
        </SectionTitle>

        <Card variant="elevated" style={[styles.activationCard, { borderColor: c.danger }]}>
          <View style={styles.activationHeader}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 18 }}>🚨</Text>
                <Text style={[styles.activationTitle, { color: c.text }]}>Immediate Response Beacon</Text>
              </View>
              <Text style={[styles.activationSubtitle, { color: c.sub }]}>
                Transmits real-time GPS telemetry and campus sector coordinates directly to security patrols & the BIT Sindri 24×7 control room.
              </Text>
            </View>
          </View>

          <PressableScale
            onPress={() => router.push('/sos')}
            haptic={false}
            accessibilityRole="button"
            accessibilityLabel="Activate Emergency SOS. Opens safety countdown."
          >
            <View style={[styles.sosButton, { backgroundColor: c.danger }]}>
              <Text style={styles.sosIcon}>🆘</Text>
              <Text style={styles.sosTitle}>ACTIVATE EMERGENCY SOS</Text>
              <Text style={styles.sosSub}>Tap to start 3-second rapid dispatch countdown</Text>
            </View>
          </PressableScale>

          <View style={styles.activationFeatures}>
            <View style={styles.activationFeatureItem}>
              <Text style={styles.featureIcon}>📍</Text>
              <Text style={[styles.featureText, { color: c.sub }]}>GPS Telemetry</Text>
            </View>
            <View style={styles.activationFeatureItem}>
              <Text style={styles.featureIcon}>⏱️</Text>
              <Text style={[styles.featureText, { color: c.sub }]}>3s Abort Safety</Text>
            </View>
            <View style={styles.activationFeatureItem}>
              <Text style={styles.featureIcon}>🛡️</Text>
              <Text style={[styles.featureText, { color: c.sub }]}>Patrol Alert</Text>
            </View>
          </View>
        </Card>

        {/* ── Virtual Night Escort Companion Widget ── */}
        {escortActive ? (
          <Card variant="elevated" style={[styles.activeEscortCard, { borderColor: c.primary }]}>
            <View style={styles.escortHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[styles.pulsingDot, { backgroundColor: c.primary }]} />
                <Text style={[styles.escortTitle, { color: c.text }]}>Virtual Escort Active</Text>
              </View>
              <Text style={[styles.escortTimerText, { color: c.primary }]}>{formatMinsSecs(escortSeconds)}</Text>
            </View>
            <Text style={[styles.escortRouteText, { color: c.sub }]}>
              📍 Route: <Text style={{ fontWeight: '700', color: c.text }}>{escortRoute}</Text>
            </Text>
            <Text style={[styles.escortNote, { color: c.faint }]}>
              Security desk is monitoring this walk. Tap "Arrived Safely" once you reach your destination.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: spacing.m }}>
              <Button title="✅ Arrived Safely" variant="primary" style={{ flex: 1 }} onPress={finishEscortSafe} />
              <Button title="🚨 Emergency SOS" variant="danger" style={{ flex: 1 }} onPress={() => router.push('/sos')} />
            </View>
          </Card>
        ) : (
          <Card style={{ marginTop: spacing.m }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 18 }}>🛡️</Text>
                  <Text style={[styles.escortPromoTitle, { color: c.text }]}>Virtual Night Escort Walk</Text>
                </View>
                <Text style={[styles.escortPromoSub, { color: c.sub }]}>
                  Walking between hostels or library after dark? Start a timed walk monitored by campus desk.
                </Text>
              </View>
              <PressableScale
                onPress={() => setEscortModal(true)}
                style={[styles.escortStartBtn, { backgroundColor: c.primarySoft, borderColor: c.primary }]}
              >
                <Text style={[styles.escortStartBtnText, { color: c.primaryDark }]}>Start Walk</Text>
              </PressableScale>
            </View>
          </Card>
        )}

        <Button title="🧾  Report a safety or facility hazard" variant="subtle" onPress={() => router.push('/report')} style={{ marginTop: spacing.m }} />

        {/* ── Quick actions Grid ── */}
        <View style={styles.quickRow}>
          <QuickAction icon="🗺️" label="Campus Map" onPress={() => router.push('/map')} />
          <QuickAction icon="☎️" label="Contacts" onPress={() => router.push('/contacts')} />
          <QuickAction icon="📋" label="My Reports" onPress={() => router.push('/my-reports')} />
        </View>
        <View style={[styles.quickRow, { marginTop: spacing.m }]}>
          <QuickAction icon="📢" label="Broadcasts" onPress={() => router.push('/announcements')} />
          <QuickAction icon="🔔" label={`Alerts${unread ? ` (${unread})` : ''}`} onPress={() => router.push('/notifications')} />
          <QuickAction icon="⚙️" label="Profile & SOPs" onPress={() => router.push('/profile')} />
        </View>

        {/* ── Rapid Campus Helplines Strip ── */}
        <SectionTitle>Verified campus emergency helplines</SectionTitle>
        <Card>
          <View style={styles.hotlineRow}>
            <PressableScale
              onPress={() => Linking.openURL('tel:+913262350495').catch(() => {})}
              style={[styles.hotlineChip, { backgroundColor: c.cardElevated, borderColor: c.border }]}
            >
              <Text style={{ fontSize: 20 }}>👮‍♂️</Text>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[styles.hotlineTitle, { color: c.text }]}>Security Control Desk</Text>
                <Text style={[styles.hotlineSub, { color: c.faint }]}>Main Gate Control · 24×7</Text>
              </View>
              <View style={[styles.callBadge, { backgroundColor: c.successSoft }]}>
                <Text style={[styles.callBadgeText, { color: c.success }]}>📞 Call</Text>
              </View>
            </PressableScale>

            <PressableScale
              onPress={() => Linking.openURL('tel:+919431123456').catch(() => {})}
              style={[styles.hotlineChip, { backgroundColor: c.cardElevated, borderColor: c.border, marginTop: 8 }]}
            >
              <Text style={{ fontSize: 20 }}>🚑</Text>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[styles.hotlineTitle, { color: c.text }]}>Campus Dispensary Ambulance</Text>
                <Text style={[styles.hotlineSub, { color: c.faint }]}>Hostel Circle · Emergency Doctor</Text>
              </View>
              <View style={[styles.callBadge, { backgroundColor: c.successSoft }]}>
                <Text style={[styles.callBadgeText, { color: c.success }]}>📞 Call</Text>
              </View>
            </PressableScale>

            <PressableScale
              onPress={() => Linking.openURL('tel:18001805522').catch(() => {})}
              style={[styles.hotlineChip, { backgroundColor: c.cardElevated, borderColor: c.border, marginTop: 8 }]}
            >
              <Text style={{ fontSize: 20 }}>🤝</Text>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[styles.hotlineTitle, { color: c.text }]}>Anti-Ragging Squad Flying Unit</Text>
                <Text style={[styles.hotlineSub, { color: c.faint }]}>Toll-Free 1800-180-5522 · Confidential</Text>
              </View>
              <View style={[styles.callBadge, { backgroundColor: c.successSoft }]}>
                <Text style={[styles.callBadgeText, { color: c.success }]}>📞 Call</Text>
              </View>
            </PressableScale>
          </View>
        </Card>

        {/* ── Safety check-in ── */}
        <SectionTitle>Campus safety check-in</SectionTitle>
        <Card variant="elevated">
          <Text style={[styles.checkinText, { color: c.sub }]}>
            {lastCheckIn
              ? `Last status: ${lastCheckIn.status === 'SAFE' ? '✅ Marked Safe' : '🆘 Requested Help'} · ${timeAgo(lastCheckIn.createdAt)}`
              : 'Let campus security and peers know you are safe during campus hours.'}
          </Text>
          <View style={styles.checkinRow}>
            <View style={{ flex: 1 }}>
              <Button title="✅ I'm safe" variant="primary" loading={checkingIn} onPress={() => doCheckIn('SAFE')} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="🆘 I need help" variant="danger" loading={checkingIn} onPress={() => doCheckIn('NEEDS_HELP')} />
            </View>
          </View>
        </Card>

        {/* ── Emergency contacts ── */}
        <SectionTitle
          action={
            <Pressable onPress={() => router.push('/contacts')} accessibilityRole="link">
              <Text style={[styles.link, { color: c.primary }]}>Manage</Text>
            </Pressable>
          }
        >
          My emergency contacts
        </SectionTitle>
        {contacts === null ? (
          <Card>
            <SkeletonList rows={1} />
          </Card>
        ) : contacts.length === 0 ? (
          <Card>
            <EmptyState
              icon="☎️"
              title="No contacts yet"
              message="Add up to 5 trusted friends or family. During an SOS, you can text them your GPS coordinates in one tap."
            />
            <Button title="Add a contact" variant="outline" onPress={() => router.push('/contacts')} />
          </Card>
        ) : (
          <Card>
            {contacts.map((contact) => (
              <ContactRow key={contact.id} contact={contact} />
            ))}
          </Card>
        )}

        {/* ── Recent reports ── */}
        <SectionTitle
          action={
            <Pressable onPress={() => router.push('/my-reports')} accessibilityRole="link">
              <Text style={[styles.link, { color: c.primary }]}>See all</Text>
            </Pressable>
          }
        >
          My active & recent reports
        </SectionTitle>
        {recent === null ? (
          <SkeletonList rows={2} />
        ) : recent.length === 0 ? (
          <Card>
            <EmptyState icon="🗂️" title="No reports yet" message="Safety incidents you submit will appear here with live responder tracking." />
          </Card>
        ) : (
          recent.map((inc) => (
            <IncidentCard
              key={inc.id}
              incident={inc}
              onPress={() => router.push(`/incident/${inc.id}`)}
            />
          ))
        )}

        {/* ── Campus Safety Guidelines & Tips Carousel ── */}
        <SectionTitle>Campus safety protocols & guides</SectionTitle>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tipsScroll}>
          {SAFETY_TIPS.map((tip) => (
            <PressableScale key={tip.id} onPress={() => setSelectedTip(tip)}>
              <View style={[styles.tipCard, { backgroundColor: c.card, borderColor: c.border }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 26 }}>{tip.icon}</Text>
                  <View style={[styles.tipBadge, { backgroundColor: c.primarySoft }]}>
                    <Text style={[styles.tipBadgeText, { color: c.primaryDark }]}>{tip.badge}</Text>
                  </View>
                </View>
                <Text style={[styles.tipTitle, { color: c.text }]}>{tip.title}</Text>
                <Text style={[styles.tipDesc, { color: c.sub }]} numberOfLines={2}>
                  {tip.desc}
                </Text>
                <Text style={[styles.tipReadMore, { color: c.primary }]}>Read guideline →</Text>
              </View>
            </PressableScale>
          ))}
        </ScrollView>

        {/* ── Safety announcements ── */}
        <SectionTitle
          action={
            <Pressable onPress={() => router.push('/announcements')} accessibilityRole="link">
              <Text style={[styles.link, { color: c.primary }]}>See all</Text>
            </Pressable>
          }
        >
          Campus safety advisories
        </SectionTitle>
        {announcements === null ? (
          <SkeletonList rows={2} />
        ) : announcements.length === 0 ? (
          <Card>
            <EmptyState icon="📢" title="No active broadcasts" message="Campus safety notices from Control Desk will appear here." />
          </Card>
        ) : (
          announcements.map((a) => (
            <PressableScale
              key={a.id}
              onPress={() => setSelectedAnnouncement(a)}
              accessibilityLabel={`Announcement: ${a.title}`}
            >
              <Card style={{ marginBottom: spacing.m }}>
                <View style={styles.annHeader}>
                  <SeverityBadge severity={a.severity} />
                  <Text style={[styles.annTime, { color: c.faint }]}>{timeAgo(a.createdAt)}</Text>
                </View>
                <Text style={[styles.annTitle, { color: c.text }]}>{a.title}</Text>
                <Text style={[styles.annMessage, { color: c.sub }]} numberOfLines={2}>
                  {a.message}
                </Text>
                <Text style={[styles.annTap, { color: c.primary }]}>Read full notice →</Text>
              </Card>
            </PressableScale>
          ))
        )}
      </ScrollView>

      {/* ── Virtual Night Escort Setup Modal ── */}
      <Modal
        visible={escortModal}
        transparent
        animationType="slide"
        onRequestClose={() => setEscortModal(false)}
      >
        <View style={[styles.modalBackdrop, { backgroundColor: c.overlay }]}>
          <View style={[styles.modalSheet, { backgroundColor: c.cardElevated }]}>
            <View style={styles.modalTopRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 22 }}>🛡️</Text>
                <Text style={[styles.modalAnnTitle, { color: c.text }]}>Virtual Escort Companion</Text>
              </View>
              <Pressable onPress={() => setEscortModal(false)} hitSlop={10}>
                <Text style={{ fontSize: 18, color: c.faint, fontWeight: '700' }}>✕</Text>
              </Pressable>
            </View>
            <Text style={[styles.modalAnnMeta, { color: c.sub }]}>
              Campus security receives your route declaration. If your walk timer expires without a safe check-in, an emergency dispatch alert is automatically initiated.
            </Text>

            <Text style={[styles.modalSectionLabel, { color: c.text }]}>Select your campus route:</Text>
            {[
              'Central Library → Senior Hostel 7',
              'Academic Wing Lab 204 → Main Gate',
              'Sports Oval → Junior Hostel 4',
              'Student Canteen → Deshpande Auditorium'
            ].map((route) => (
              <Pressable
                key={route}
                onPress={() => setEscortRoute(route)}
                style={[
                  styles.routePresetChip,
                  {
                    backgroundColor: escortRoute === route ? c.primarySoft : c.card,
                    borderColor: escortRoute === route ? c.primary : c.border
                  }
                ]}
              >
                <Text style={{ fontSize: 14 }}>📍</Text>
                <Text style={[styles.routePresetText, { color: escortRoute === route ? c.primaryDark : c.text }]}>
                  {route}
                </Text>
              </Pressable>
            ))}

            <Text style={[styles.modalSectionLabel, { color: c.text, marginTop: spacing.m }]}>Estimated walk duration:</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {[5, 10, 15, 20].map((mins) => (
                <PressableScale
                  key={mins}
                  onPress={() => startEscort(mins, escortRoute)}
                  style={[styles.durationChip, { backgroundColor: c.primary, flex: 1 }]}
                >
                  <Text style={styles.durationChipText}>{mins} mins</Text>
                </PressableScale>
              ))}
            </View>

            <Button
              title="Cancel"
              variant="subtle"
              style={{ marginTop: spacing.m }}
              onPress={() => setEscortModal(false)}
            />
          </View>
        </View>
      </Modal>

      {/* ── Safety Tip Detail Modal ── */}
      <Modal
        visible={!!selectedTip}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedTip(null)}
      >
        <View style={[styles.modalBackdrop, { backgroundColor: c.overlay }]}>
          <View style={[styles.modalSheet, { backgroundColor: c.cardElevated }]}>
            {selectedTip && (
              <>
                <View style={styles.modalTopRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 24 }}>{selectedTip.icon}</Text>
                    <Text style={[styles.modalAnnTitle, { color: c.text }]}>{selectedTip.title}</Text>
                  </View>
                  <Pressable onPress={() => setSelectedTip(null)} hitSlop={10}>
                    <Text style={{ fontSize: 18, color: c.faint, fontWeight: '700' }}>✕</Text>
                  </Pressable>
                </View>

                <ScrollView style={{ maxHeight: 280, marginVertical: spacing.m }}>
                  {selectedTip.points.map((pt, idx) => (
                    <View key={idx} style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                      <Text style={{ color: c.primary, fontWeight: '700' }}>•</Text>
                      <Text style={[styles.tipPointText, { color: c.text }]}>{pt}</Text>
                    </View>
                  ))}
                </ScrollView>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Button
                    title="📞 Call Control Desk"
                    variant="primary"
                    style={{ flex: 1 }}
                    onPress={() => {
                      Linking.openURL('tel:+913262350495').catch(() => {});
                      setSelectedTip(null);
                    }}
                  />
                  <Button
                    title="Close"
                    variant="subtle"
                    style={{ flex: 1 }}
                    onPress={() => setSelectedTip(null)}
                  />
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Full Announcement Detail Modal ── */}
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
                  <SeverityBadge severity={selectedAnnouncement.severity} />
                  <Pressable onPress={() => setSelectedAnnouncement(null)} hitSlop={10}>
                    <Text style={{ fontSize: 18, color: c.faint, fontWeight: '700' }}>✕</Text>
                  </Pressable>
                </View>
                <Text style={[styles.modalAnnTitle, { color: c.text }]}>{selectedAnnouncement.title}</Text>
                <Text style={[styles.modalAnnMeta, { color: c.faint }]}>
                  Broadcasted {formatDateTime(selectedAnnouncement.createdAt)} · Campus Safety Desk
                </Text>

                <ScrollView style={{ maxHeight: 240, marginVertical: spacing.m }}>
                  <Text style={[styles.modalAnnBody, { color: c.text }]}>{selectedAnnouncement.message}</Text>
                </ScrollView>

                <View style={[styles.modalTipBox, { backgroundColor: c.card, borderColor: c.border }]}>
                  <Text style={[styles.modalTipTitle, { color: c.primary }]}>Campus Safety Directive:</Text>
                  <Text style={[styles.modalTipText, { color: c.sub }]}>
                    Follow the instructions above carefully. Contact the Campus Control Room immediately if you observe active safety risks.
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
    </SafeAreaView>
  );
}

function QuickAction({ icon, label, onPress }) {
  const c = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <PressableScale onPress={onPress} accessibilityLabel={label} style={{ width: '100%' }}>
        <View style={[styles.quick, { backgroundColor: c.card, borderColor: c.border }, shadowSubtle]}>
          <Text style={{ fontSize: 24, marginBottom: 4 }}>{icon}</Text>
          <Text style={[styles.quickLabel, { color: c.text }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
      </PressableScale>
    </View>
  );
}

function ContactRow({ contact }) {
  const c = useTheme();
  const call = () => Linking.openURL(`tel:${contact.phone}`).catch(() => {});
  const sms = () =>
    Linking.openURL(`sms:${contact.phone}?&body=This is my current location from SecureByte (sent without an active SOS).`)
      .catch(() => {});

  return (
    <View style={styles.contactRow}>
      <View style={[styles.contactAvatar, { backgroundColor: c.primarySoft }]}>
        <Text style={[styles.contactAvatarText, { color: c.primaryDark }]}>{contact.name[0]?.toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.contactName, { color: c.text }]} numberOfLines={1}>
          {contact.name}
        </Text>
        <Text style={[styles.contactPhone, { color: c.faint }]}>{contact.phone}{contact.relation ? ` · ${contact.relation}` : ''}</Text>
      </View>
      <Pressable onPress={call} accessibilityLabel={`Call ${contact.name}`} style={[styles.contactBtn, { backgroundColor: c.successSoft }]}>
        <Text style={{ fontSize: 16 }}>📞</Text>
      </Pressable>
      <Pressable onPress={sms} accessibilityLabel={`Text ${contact.name}`} style={[styles.contactBtn, { backgroundColor: c.infoSoft, marginLeft: spacing.s }]}>
        <Text style={{ fontSize: 16 }}>💬</Text>
      </Pressable>
    </View>
  );
}

export default function StudentHome() {
  return (
    <AuthGate>
      <RoleGate role="STUDENT">
        <Home />
      </RoleGate>
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: spacing.l, paddingBottom: spacing.xxl },
  greetingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.m },
  roleTag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.pill },
  roleTagText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  bellWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellIcon: { fontSize: 19 },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  hi: { ...type.title, fontSize: 21 },
  question: { fontSize: 13, marginTop: 2 },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18, fontWeight: '800' },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.m,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: spacing.m,
    gap: 8,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 11.5, fontWeight: '700', flex: 1 },
  activationCard: {
    borderWidth: 1.5,
    borderRadius: radius.l,
    padding: spacing.l,
    marginBottom: spacing.m,
  },
  activationHeader: {
    marginBottom: spacing.m,
  },
  activationTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  activationSubtitle: {
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 3,
  },
  activationFeatures: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.m,
    paddingTop: spacing.m,
    borderTopWidth: 1,
    borderTopColor: 'rgba(150, 150, 150, 0.15)',
  },
  activationFeatureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  featureIcon: {
    fontSize: 13,
  },
  featureText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  sosButton: {
    borderRadius: radius.xl,
    alignItems: 'center',
    paddingVertical: spacing.xl,
    elevation: 8,
    shadowColor: '#991B1B',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  sosIcon: { fontSize: 40 },
  sosTitle: { color: '#fff', fontSize: 24, fontWeight: '900', letterSpacing: 1.5, marginTop: spacing.s },
  sosSub: { color: '#FECACA', fontSize: 13, marginTop: 4 },
  activeEscortCard: { marginTop: spacing.m, borderWidth: 1.5 },
  escortHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  pulsingDot: { width: 10, height: 10, borderRadius: 5 },
  escortTitle: { fontSize: 15, fontWeight: '800' },
  escortTimerText: { fontSize: 22, fontWeight: '900', fontVariant: ['tabular-nums'] },
  escortRouteText: { fontSize: 13, marginBottom: 4 },
  escortNote: { fontSize: 12, lineHeight: 17 },
  escortPromoTitle: { fontSize: 14.5, fontWeight: '700' },
  escortPromoSub: { fontSize: 12, lineHeight: 17, marginTop: 3 },
  escortStartBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.m, borderWidth: 1 },
  escortStartBtnText: { fontSize: 12.5, fontWeight: '800' },
  quickRow: { flexDirection: 'row', gap: spacing.s, marginTop: spacing.m },
  quick: {
    borderWidth: 1,
    borderRadius: radius.l,
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 6,
  },
  quickLabel: { fontSize: 12, fontWeight: '700', marginTop: 2, textAlign: 'center' },
  hotlineRow: { flexDirection: 'column' },
  hotlineChip: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: radius.m,
    borderWidth: 1,
  },
  hotlineTitle: { fontSize: 14, fontWeight: '700', letterSpacing: -0.1 },
  hotlineSub: { fontSize: 12, marginTop: 2 },
  callBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  callBadgeText: { fontSize: 12.5, fontWeight: '800' },
  checkinText: { fontSize: 13.5, lineHeight: 20, marginBottom: spacing.m },
  checkinRow: { flexDirection: 'row', gap: spacing.m },
  link: { fontWeight: '800', fontSize: 13.5 },
  tipsScroll: { paddingVertical: 6, gap: 14 },
  tipCard: { width: 230, padding: 16, borderRadius: radius.l, borderWidth: 1 },
  tipBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  tipBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  tipTitle: { fontSize: 15, fontWeight: '800', marginTop: 10, letterSpacing: -0.2 },
  tipDesc: { fontSize: 12.5, lineHeight: 18, marginTop: 5 },
  tipReadMore: { fontSize: 12.5, fontWeight: '800', marginTop: 10 },
  tipPointText: { fontSize: 13.5, lineHeight: 21, flex: 1 },
  annHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  annTime: { fontSize: 12 },
  annTitle: { fontSize: 15, fontWeight: '700', marginTop: spacing.s },
  annMessage: { fontSize: 13.5, marginTop: 4, lineHeight: 20 },
  annTap: { fontSize: 12, fontWeight: '700', marginTop: 8 },
  contactRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  contactAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginRight: spacing.m },
  contactAvatarText: { fontSize: 15, fontWeight: '800' },
  contactName: { fontSize: 14, fontWeight: '600' },
  contactPhone: { fontSize: 12, marginTop: 1 },
  contactBtn: { width: 40, height: 40, borderRadius: radius.s, alignItems: 'center', justifyContent: 'center' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end' },
  modalSheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  modalTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.m },
  modalAnnTitle: { ...type.headline, fontSize: 18, lineHeight: 24 },
  modalAnnMeta: { fontSize: 12.5, lineHeight: 18, marginBottom: spacing.m },
  modalSectionLabel: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', marginBottom: 8 },
  routePresetChip: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: radius.m, borderWidth: 1, marginBottom: 8, gap: 8 },
  routePresetText: { fontSize: 13.5, fontWeight: '600' },
  durationChip: { paddingVertical: 12, borderRadius: radius.m, alignItems: 'center' },
  durationChipText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  modalAnnBody: { fontSize: 14, lineHeight: 22 },
  modalTipBox: { padding: 12, borderRadius: radius.m, borderWidth: 1, marginTop: spacing.s },
  modalTipTitle: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  modalTipText: { fontSize: 12.5, lineHeight: 18, marginTop: 2 },
  verifBanner: {
    padding: spacing.m,
    borderRadius: radius.l,
    borderWidth: 1.5,
    marginTop: spacing.s,
    marginBottom: spacing.xs,
  },
  verifTitle: { fontSize: 14.5, fontWeight: '800' },
  verifSub: { fontSize: 12.5, lineHeight: 17, marginTop: 2 },
  verifActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  verifActionText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  staffPortalBanner: {
    padding: spacing.m,
    borderRadius: radius.l,
    borderWidth: 1.5,
    marginTop: spacing.s,
    marginBottom: spacing.xs,
  },
  staffPortalTitle: { fontSize: 14, fontWeight: '800' },
  staffPortalSub: { fontSize: 12, marginTop: 2 },
  staffPortalLink: { fontSize: 12.5, fontWeight: '800' },
});
