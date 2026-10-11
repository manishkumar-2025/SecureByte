import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, BackHandler, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { api } from '../src/api/client';
import { enqueueIncident } from '../src/utils/outboxQueue';
import { storage } from '../src/utils/storage';
import { AuthGate } from '../src/components/Gate';
import ScreenHeader from '../src/components/ScreenHeader';
import Card from '../src/components/Card';
import Button from '../src/components/Button';
import Input from '../src/components/Input';
import PressableScale from '../src/components/PressableScale';
import { ErrorBanner } from '../src/components/Feedback';
import { useLocation } from '../src/hooks/useLocation';
import { useTheme, useReducedMotion } from '../src/hooks/useTheme';
import { radius, spacing, type } from '../src/theme';

const SOS_LANDMARKS = [
  'Main Security Gate',
  'Senior Hostel 7',
  'Deshpande Library',
  'Sports Pavilion',
  'Hostel Circle 4',
  'Dispensary Clinic'
];

const EMERGENCY_HELPLINES = [
  {
    name: 'BIT Security Control Room',
    role: '24×7 Main Gate Control & Rapid Patrol',
    phone: '+913262350495',
    display: '+91 326 2350495',
    icon: '👮‍♂️',
  },
  {
    name: 'Campus Dispensary & Ambulance',
    role: 'Emergency Medical Care & Paramedic',
    phone: '+919431123456',
    display: '+91 94311 23456',
    icon: '🚑',
  },
  {
    name: 'National Emergency Service (ERSS)',
    role: 'Police, Fire & Medical Pan-India',
    phone: '112',
    display: '112 (Toll-Free)',
    icon: '🚨',
  },
];

/**
 * Emergency SOS flow — engineered for stress:
 *  1. Big single-tap ACTIVATE button
 *  2. 3-second confirmation countdown with a HUGE cancel target
 *  3. False alarm → cancelled, nothing sent
 *  4. Countdown completes → GPS location requested & CRITICAL alert submitted
 *  5. Post-alert screen with live responder tracking + 1-tap SMS to personal contacts
 *  6. Offline resilience → auto-queues in outbox and activates instant phone/SMS dials
 */
function Sos() {
  const router = useRouter();
  const c = useTheme();
  const reducedMotion = useReducedMotion();
  const location = useLocation();

  const [phase, setPhase] = useState('idle'); // idle | counting | submitting | sent | offline | error
  const [count, setCount] = useState(3);
  const [landmark, setLandmark] = useState('');
  const [incident, setIncident] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => () => timerRef.current && clearInterval(timerRef.current), []);

  const loadContacts = useCallback(async () => {
    try {
      const cached = await storage.getItem('cache_emergency_contacts');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) setContacts(parsed);
        } catch (err) {}
      }
    } catch (err) {}

    try {
      const data = await api('/api/contacts');
      if (data.items) {
        setContacts(data.items);
        await storage.setItem('cache_emergency_contacts', JSON.stringify(data.items));
      }
    } catch (e) {
      /* non-fatal — SOS works without contacts */
    }
  }, []);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  const startCountdown = () => {
    setError(null);
    setCount(3);
    setPhase('counting');
    progress.setValue(0);
    if (!reducedMotion) {
      Animated.timing(progress, { toValue: 1, duration: 3000, useNativeDriver: true }).start();
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    timerRef.current = setInterval(() => {
      setCount((v) => {
        if (v <= 1) {
          clearInterval(timerRef.current);
          submitAlert();
          return 0;
        }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
        return v - 1;
      });
    }, 1000);
  };

  const cancel = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setPhase('idle');
    setCount(3);
    setError(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  useEffect(() => {
    if (phase !== 'counting') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      cancel();
      return true;
    });
    return () => sub.remove();
  }, [phase]);

  const submitAlert = async () => {
    setPhase('submitting');
    setError(null);

    const locResult = await location.request();
    const locStatus = typeof locResult === 'string' ? locResult : locResult?.status;
    const locCoords = locResult?.coords || location.coords;

    const payload = {
      isSos: true,
      description: 'Emergency SOS alert triggered from the CampusShield mobile app.',
    };
    if (locStatus === 'granted' && locCoords) {
      payload.location = {
        latitude: locCoords.latitude,
        longitude: locCoords.longitude,
        currentLatitude: locCoords.latitude,
        currentLongitude: locCoords.longitude,
        gpsAccuracy: locCoords.accuracy ?? null,
        locationSource: 'GPS',
      };
    } else if (landmark.trim().length >= 3) {
      payload.location = {
        campusLandmark: landmark.trim(),
        locationSource: 'LANDMARK',
      };
    } else {
      payload.location = {
        locationSource: 'UNAVAILABLE',
      };
    }

    try {
      const data = await api('/api/incidents', { method: 'POST', body: payload });
      setIncident(data.incident);
      setPhase('sent');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      if (e.code === 'NETWORK_ERROR' || e.status === 0 || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
        // Enqueue into persistent offline outbox
        const queued = await enqueueIncident(payload);
        const syntheticIncident = {
          id: queued?.id || `OFFLINE-${Date.now().toString(36).toUpperCase()}`,
          title: 'Emergency SOS (Queued for Sync)',
          description: payload.description,
          priority: 'CRITICAL',
          status: 'PENDING_OFFLINE_SYNC',
          location: payload.location,
          createdAt: new Date().toISOString(),
          isOfflineQueued: true,
        };
        setIncident(syntheticIncident);
        setPhase('offline');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        return;
      }

      setError(
        e.code === 'DUPLICATE_SUBMISSION'
          ? 'Your SOS was already received a moment ago. Check My Reports — no need to send it again.'
          : e.code === 'UNVERIFIED_ACCOUNT'
          ? 'Account verification required. Please verify your account to send emergency alerts.'
          : e.message
      );
      setPhase('error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
  };

  /** Opens the SMS app with every saved contact pre-filled. */
  const notifyContacts = () => {
    const coords =
      incident?.location?.latitude != null
        ? `My location: https://maps.google.com/?q=${incident.location.latitude},${incident.location.longitude}`
        : incident?.location?.campusLandmark
        ? `Landmark: ${incident.location.campusLandmark}`
        : 'Location unavailable — please call me.';
    const body = `🆘 Campus Emergency SOS sent from CampusShield at BIT Sindri. ${coords} — Please check in on me or contact Campus Security.`;

    const separator = Platform.OS === 'ios' ? ',' : ';';
    const numbers = contacts.length > 0 ? contacts.map((ct) => ct.phone).join(separator) : '+913262350495';
    const smsUrl = Platform.OS === 'ios'
      ? `sms:${numbers}&body=${encodeURIComponent(body)}`
      : `sms:${numbers}?body=${encodeURIComponent(body)}`;

    Linking.openURL(smsUrl).catch(() => {
      const fallbackNum = contacts[0]?.phone || '+913262350495';
      Linking.openURL(`sms:${fallbackNum}?body=${encodeURIComponent(body)}`).catch(() => {});
    });
  };

  const mapsLink = () => {
    if (incident?.location?.latitude != null) {
      Linking.openURL(`https://maps.google.com/?q=${incident.location.latitude},${incident.location.longitude}`).catch(() => {});
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.background }]}>
      <ScreenHeader
        title="Emergency SOS"
        subtitle="Direct 24×7 Campus Police & Responder Dispatch"
        onBack={phase === 'counting' ? cancel : true}
      />

      {phase === 'offline' ? (
        <ScrollView contentContainerStyle={[styles.scroll, { maxWidth: 580, width: '100%', alignSelf: 'center' }]}>
          <View style={styles.sentBlock}>
            <Text style={styles.sentIcon}>📡</Text>
            <Text style={[styles.sentTitle, { color: c.danger }]}>Offline Emergency Mode Active</Text>
            <Text style={[styles.sentSub, { color: c.sub }]}>
              Network unavailable. Your digital SOS has been queued to sync automatically the moment connectivity restores. Use direct cellular lines and SMS below immediately.
            </Text>

            {/* Prominent Cellular Quick Dials */}
            <Card style={{ width: '100%', marginTop: spacing.l, borderColor: c.danger, borderWidth: 1.5 }}>
              <Text style={[styles.infoTitle, { color: c.danger }]}>📞 Immediate Direct Cellular Helplines</Text>
              <Text style={[styles.contactHint, { color: c.sub }]}>
                Standard cellular phone call operates even without internet data. Tap below to dial control room directly:
              </Text>
              {EMERGENCY_HELPLINES.map((hl) => (
                <PressableScale
                  key={hl.phone}
                  onPress={() => Linking.openURL(`tel:${hl.phone}`).catch(() => {})}
                  style={[styles.helplineBtn, { backgroundColor: c.cardElevated, borderColor: c.border }]}
                >
                  <Text style={{ fontSize: 24, marginRight: spacing.s }}>{hl.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.helplineName, { color: c.text }]}>{hl.name}</Text>
                    <Text style={[styles.helplineRole, { color: c.sub }]}>{hl.role}</Text>
                  </View>
                  <View style={[styles.dialBadge, { backgroundColor: c.dangerSoft }]}>
                    <Text style={[styles.dialBadgeText, { color: c.danger }]}>Call {hl.display}</Text>
                  </View>
                </PressableScale>
              ))}
            </Card>

            {/* Offline Coordinates & Direct SMS */}
            <Card style={{ width: '100%', marginTop: spacing.m }}>
              <Text style={[styles.infoTitle, { color: c.text }]}>💬 Send Pre-filled Emergency SMS</Text>
              <Text style={[styles.contactHint, { color: c.sub }]}>
                Pre-fills your device SMS app with exact coordinates/landmark to dispatch via cellular text to your emergency contacts or security desk.
              </Text>
              <Button
                title={contacts.length > 0 ? `💬 Dispatch SMS to ${contacts.length} Contact${contacts.length > 1 ? 's' : ''}` : '💬 Dispatch SMS to Security Desk'}
                onPress={notifyContacts}
                style={{ backgroundColor: c.danger }}
              />
            </Card>

            {/* Incident Outbox Reference */}
            <Card style={{ width: '100%', marginTop: spacing.m }}>
              <Text style={[styles.kvLabel, { color: c.faint }]}>Queued Outbox Reference</Text>
              <Text style={[styles.kvValue, { color: c.text, fontWeight: '700' }]}>{incident?.id}</Text>
              <Text style={[styles.kvLabel, { color: c.faint }]}>Outbox Sync Status</Text>
              <Text style={[styles.kvValue, { color: '#D97706', fontWeight: '700' }]}>
                ⏳ QUEUED LOCALLY — Auto-submits upon network restoration
              </Text>
              {incident?.location ? (
                <>
                  <Text style={[styles.kvLabel, { color: c.faint }]}>Saved Incident Coordinates</Text>
                  <Text style={[styles.kvValue, { color: c.text }]}>
                    {incident.location.latitude != null
                      ? `${incident.location.latitude.toFixed(5)}, ${incident.location.longitude?.toFixed(5)}`
                      : ''}
                    {incident.location.campusLandmark ? `  📍 ${incident.location.campusLandmark}` : ''}
                  </Text>
                </>
              ) : null}
            </Card>

            <Button title="View Outbox in My Reports" onPress={() => router.replace('/my-reports')} style={{ alignSelf: 'stretch', marginTop: spacing.l }} />
            <Button title="Return to Home" variant="ghost" onPress={() => router.replace('/home')} style={{ alignSelf: 'stretch', marginTop: spacing.s }} />
          </View>
        </ScrollView>
      ) : phase === 'sent' ? (
        <ScrollView contentContainerStyle={[styles.scroll, { maxWidth: 580, width: '100%', alignSelf: 'center' }]}>
          <View style={styles.sentBlock}>
            <Text style={styles.sentIcon}>🚨</Text>
            <Text style={[styles.sentTitle, { color: c.danger }]}>SOS Alert Dispatched to Control Desk</Text>
            <Text style={[styles.sentSub, { color: c.sub }]}>
              Campus responders on duty have received this critical alert with your location.
            </Text>

            <Card style={{ width: '100%', marginTop: spacing.l }}>
              <Text style={[styles.kvLabel, { color: c.faint }]}>Incident Reference</Text>
              <Text style={[styles.kvValue, { color: c.text, fontWeight: '700' }]}>{incident?.id}</Text>
              <Text style={[styles.kvLabel, { color: c.faint }]}>Live Dispatch Status</Text>
              <Text style={[styles.kvValue, { color: c.primary, fontWeight: '700' }]}>
                ● ACTIVE DISPATCH — Awaiting responder unit arrival
              </Text>
              {incident?.location ? (
                <>
                  <Text style={[styles.kvLabel, { color: c.faint }]}>Location Recorded</Text>
                  <Text style={[styles.kvValue, { color: c.text }]}>
                    {incident.location.latitude != null
                      ? `${incident.location.latitude.toFixed(5)}, ${incident.location.longitude?.toFixed(5)}`
                      : incident.location.campusLandmark
                      ? `📍 ${incident.location.campusLandmark}`
                      : '⚠️ Coordinates unavailable — responders alerted to contact student'}
                  </Text>
                  <Text style={[styles.kvLabel, { color: c.faint }]}>Location Verification</Text>
                  <Text style={[styles.kvValue, { color: incident.location.isOutsideCampus ? '#D97706' : c.success, fontWeight: '600' }]}>
                    {incident.location.verificationStatus === 'VERIFIED_MATCH'
                      ? '✓ GPS Coordinates Verified'
                      : incident.location.verificationStatus === 'UNAVAILABLE'
                      ? '⚠️ Unverified (No Coordinates)'
                      : incident.location.locationSource === 'LANDMARK'
                      ? '📍 Campus Landmark Supplied'
                      : '● Captured via Device'}
                    {incident.location.isOutsideCampus ? ' • Outside Campus Perimeter (Off-Campus Protocol Active)' : ''}
                  </Text>
                </>
              ) : null}
              {incident?.location?.latitude != null ? (
                <Button title="🗺️ View Coordinates on Google Maps" variant="outline" onPress={mapsLink} style={{ marginTop: spacing.m }} />
              ) : null}
            </Card>

            {/* Survival Directive Checklist */}
            <Card style={{ width: '100%', marginTop: spacing.m }}>
              <Text style={[styles.infoTitle, { color: c.text }]}>Immediate Safety Directives:</Text>
              <View style={styles.directiveRow}>
                <Text style={{ fontSize: 16 }}>1️⃣</Text>
                <Text style={[styles.directiveText, { color: c.sub }]}>Move into a well-lit, open area with student or staff presence if feasible.</Text>
              </View>
              <View style={styles.directiveRow}>
                <Text style={{ fontSize: 16 }}>2️⃣</Text>
                <Text style={[styles.directiveText, { color: c.sub }]}>Keep your phone volume on loud; response officers will call to verify your status.</Text>
              </View>
              <View style={styles.directiveRow}>
                <Text style={{ fontSize: 16 }}>3️⃣</Text>
                <Text style={[styles.directiveText, { color: c.sub }]}>Do not confront aggressive individuals. Security patrol jeep is on route.</Text>
              </View>
            </Card>

            {/* One-tap SMS to personal emergency contacts */}
            {contacts.length > 0 ? (
              <Card style={{ width: '100%', marginTop: spacing.m }}>
                <Text style={[styles.infoTitle, { color: c.text }]}>Notify Personal Emergency Contacts</Text>
                <Text style={[styles.contactHint, { color: c.sub }]}>
                  Pre-fills your SMS app with {contacts.length === 1 ? contacts[0].name : `${contacts.length} emergency contacts`} and your GPS link.
                </Text>
                <Button title={`💬 Send SMS to ${contacts.length} Contact${contacts.length > 1 ? 's' : ''}`} onPress={notifyContacts} />
              </Card>
            ) : null}

            <Button title="Track Resolution in My Reports" onPress={() => router.replace('/my-reports')} style={{ alignSelf: 'stretch', marginTop: spacing.l }} />
            <Button title="Return to Home" variant="ghost" onPress={() => router.replace('/home')} style={{ alignSelf: 'stretch', marginTop: spacing.s }} />
          </View>
        </ScrollView>
      ) : phase === 'submitting' ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={c.danger} />
          <Text style={[styles.sending, { color: c.danger }]}>Dispatching emergency alert to campus desk…</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.scroll, { maxWidth: 580, width: '100%', alignSelf: 'center' }]}>
          <ErrorBanner message={error} onRetry={phase === 'error' ? startCountdown : undefined} />

          {phase === 'counting' ? (
            <View style={styles.countBlock}>
              <Text style={[styles.countTitle, { color: c.text }]}>DISPATCHING SOS IN</Text>
              <Text style={[styles.countNumber, { color: c.danger }]} accessibilityLiveRegion="assertive">
                {count}
              </Text>
              <View style={[styles.progressTrack, { backgroundColor: c.border }]}>
                <Animated.View
                  style={{
                    height: '100%',
                    borderRadius: 6,
                    backgroundColor: c.danger,
                    transform: [{ scaleX: reducedMotion ? 0.5 : progress.interpolate({ inputRange: [0, 1], outputRange: [0.001, 1] }) }],
                    width: '100%',
                  }}
                />
              </View>
              <Text style={[styles.countHint, { color: c.sub }]}>Accidental tap? Cancel now—no alert has been transmitted yet.</Text>
              <Pressable
                onPress={cancel}
                accessibilityRole="button"
                accessibilityLabel="Cancel false alarm"
                style={({ pressed }) => [styles.cancelButton, { backgroundColor: c.card, borderColor: c.success }, pressed && styles.cancelPressed]}
              >
                <Text style={[styles.cancelText, { color: c.success }]}>✋ CANCEL — FALSE ALARM</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Card style={styles.infoCard}>
                <Text style={[styles.infoTitle, { color: c.text }]}>How CampusShield SOS Operates</Text>
                <Text style={[styles.infoLine, { color: c.sub }]}>1️⃣  A 3-second tactile countdown begins—cancel anytime without dispatch.</Text>
                <Text style={[styles.infoLine, { color: c.sub }]}>2️⃣  GPS coordinates are immediately captured and broadcast to Control Desk.</Text>
                <Text style={[styles.infoLine, { color: c.sub }]}>3️⃣  A CRITICAL priority dispatch event is created for on-duty quick action teams.</Text>
              </Card>

              {/* Landmark Presets */}
              <Card style={{ marginBottom: spacing.m }}>
                <Text style={[styles.presetTitle, { color: c.text }]}>Current Sector Landmark (Optional)</Text>
                <Text style={[styles.presetHint, { color: c.faint }]}>Tap a sector below to tag your location if GPS satellite fix is delayed:</Text>
                <View style={styles.landmarkChipRow}>
                  {SOS_LANDMARKS.map((lm) => (
                    <PressableScale
                      key={lm}
                      onPress={() => setLandmark(lm)}
                      style={[
                        styles.lmChip,
                        {
                          backgroundColor: landmark === lm ? c.primarySoft : c.cardElevated,
                          borderColor: landmark === lm ? c.primary : c.border
                        }
                      ]}
                    >
                      <Text style={[styles.lmChipText, { color: landmark === lm ? c.primaryDark : c.text }]}>
                        📍 {lm}
                      </Text>
                    </PressableScale>
                  ))}
                </View>

                {landmark ? (
                  <Text style={[styles.selectedLm, { color: c.primary }]}>Selected: {landmark}</Text>
                ) : null}
              </Card>

              <Text style={[styles.locNote, { color: c.sub }]}>
                {location.loading
                  ? '📍 Acquiring high-precision GPS…'
                  : location.coords
                  ? '📍 High-precision GPS acquired and ready for dispatch.'
                  : '📍 Location coordinates will be attached automatically upon activation.'}
              </Text>

              <Pressable
                onPress={startCountdown}
                accessibilityRole="button"
                accessibilityLabel="Activate emergency SOS"
                style={({ pressed }) => [styles.bigSos, { backgroundColor: c.danger, borderColor: c.dangerDark }, pressed && styles.sosPressed]}
              >
                <Text style={styles.bigSosText}>ACTIVATE SOS</Text>
                <Text style={styles.bigSosSub}>Tap once to initiate 3-second countdown</Text>
              </Pressable>

              <Text style={[styles.disclaimer, { color: c.faint }]}>
                BIT Sindri Campus Safety Desk · In life-threatening emergencies, dial 112 directly.
              </Text>
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

export default function SosScreen() {
  return (
    <AuthGate>
      <Sos />
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: spacing.l, paddingBottom: spacing.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  sending: { marginTop: spacing.m, ...type.headline, textAlign: 'center' },
  infoCard: { marginBottom: spacing.m },
  infoTitle: { ...type.bodyStrong, fontSize: 15, marginBottom: 8 },
  infoLine: { fontSize: 13, lineHeight: 20, marginBottom: 4 },
  contactHint: { fontSize: 13, lineHeight: 19, marginBottom: spacing.m },
  locNote: { fontSize: 12.5, marginBottom: spacing.m, textAlign: 'center' },
  presetTitle: { fontSize: 13.5, fontWeight: '700' },
  presetHint: { fontSize: 12, marginTop: 2, marginBottom: 8 },
  landmarkChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  lmChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1 },
  lmChipText: { fontSize: 12, fontWeight: '600' },
  selectedLm: { fontSize: 12, fontWeight: '700', marginTop: 8 },
  bigSos: {
    borderRadius: radius.xl,
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    marginTop: spacing.s,
    borderWidth: 3,
    elevation: 6,
  },
  sosPressed: { opacity: 0.9 },
  bigSosText: { color: '#FFFFFF', fontSize: 30, fontWeight: '900', letterSpacing: 2 },
  bigSosSub: { color: '#FECACA', fontSize: 12.5, marginTop: 6 },
  countBlock: { alignItems: 'center', marginTop: spacing.xl },
  countTitle: { ...type.headline, fontSize: 18, letterSpacing: 1 },
  countNumber: { fontSize: 110, fontWeight: '900', marginVertical: spacing.m, fontVariant: ['tabular-nums'] },
  progressTrack: { width: '72%', height: 12, borderRadius: 6, overflow: 'hidden', marginBottom: spacing.l },
  countHint: { fontSize: 13.5, marginBottom: spacing.l, textAlign: 'center', paddingHorizontal: spacing.xl },
  cancelButton: {
    borderWidth: 2.5,
    borderRadius: radius.l,
    paddingHorizontal: spacing.xl,
    minHeight: 68,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  cancelPressed: { opacity: 0.8 },
  cancelText: { fontSize: 17, fontWeight: '900' },
  sentBlock: { alignItems: 'center', paddingTop: spacing.m },
  sentIcon: { fontSize: 56 },
  sentTitle: { ...type.title, marginTop: spacing.m, textAlign: 'center' },
  sentSub: { fontSize: 13, textAlign: 'center', marginTop: 4, lineHeight: 18 },
  kvLabel: { fontSize: 11, fontWeight: '700', marginTop: spacing.m, textTransform: 'uppercase', letterSpacing: 0.5 },
  kvValue: { fontSize: 13.5, marginTop: 2, lineHeight: 19 },
  directiveRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  directiveText: { fontSize: 12.5, lineHeight: 18, flex: 1 },
  disclaimer: { textAlign: 'center', fontSize: 11.5, marginTop: spacing.xl, lineHeight: 17 },
  helplineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: radius.m,
    borderWidth: 1,
    marginBottom: 8,
  },
  helplineName: { fontSize: 13.5, fontWeight: '700' },
  helplineRole: { fontSize: 11.5, marginTop: 2 },
  dialBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    marginLeft: 8,
  },
  dialBadgeText: { fontSize: 11.5, fontWeight: '700' },
});
