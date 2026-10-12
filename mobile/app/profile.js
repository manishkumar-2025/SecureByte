import React, { useEffect, useState } from 'react';
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Notifications from '../src/utils/notifications';
import * as Device from 'expo-device';
import { useAuth } from '../src/context/AuthContext';
import { api } from '../src/api/client';
import { storage } from '../src/utils/storage';
import { requestAndRegisterPushToken } from '../src/utils/pushRegister';
import { AuthGate } from '../src/components/Gate';
import ScreenHeader from '../src/components/ScreenHeader';
import Card, { SectionTitle } from '../src/components/Card';
import Button from '../src/components/Button';
import Input from '../src/components/Input';
import PressableScale from '../src/components/PressableScale';
import { RoleBadge, VerificationBadge } from '../src/components/Badges';
import { ErrorBanner } from '../src/components/Feedback';
import { useConfirm } from '../src/components/ConfirmDialog';
import { useToast } from '../src/components/Toast';
import { radius, spacing, type } from '../src/theme';
import { useTheme } from '../src/hooks/useTheme';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];

const DEFAULT_MEDICAL = {
  bloodGroup: 'O+',
  allergies: 'None reported',
  chronicConditions: 'None',
  medications: 'None',
  emergencyContactName: 'Campus Guardian / Parent',
  emergencyContactPhone: '+91 94311 23456',
  medicalNotes: 'No known pre-existing surgical conditions or drug allergies.',
  clinicCardNo: 'BIT-MED-2024-042',
  updatedAt: '11 Oct 2026',
};

const SAFETY_GUIDES = [
  {
    id: 'fire',
    title: 'Fire Safety & Building Evacuation',
    icon: '🔥',
    summary: 'Procedures for smoke detection, fire alarm triggers and assembly points.',
    content: [
      '1. Sound the alarm immediately: Activate the nearest wall pull-station or use the CampusShield SOS.',
      '2. Evacuate quickly: Use designated fire exit staircases. Never use lifts or elevators during fire alerts.',
      '3. Assemble at safety rally points: Gather at Deshpande Auditorium grounds or Central Sports Oval.',
      '4. Do not re-enter: Remain at the assembly point until safety marshals declare all clear.',
      '5. Extinguisher locations: ABC dry powder extinguishers are located at every department floor landing.',
    ],
  },
  {
    id: 'medical',
    title: 'Medical Emergencies & First Aid',
    icon: '🏥',
    summary: 'Response steps for accidents, fainting, severe injury and ambulance dispatch.',
    content: [
      '1. Assess immediate danger: Ensure the scene is safe before approaching the patient.',
      '2. Alert campus clinic: Call BIT Dispensary directly (+91 94311 23456) or trigger Medical SOS.',
      '3. Keep patient stable: Keep the individual lying flat, warm, and comfortable. Do not move spine-injury suspects.',
      '4. Recovery position: If unconscious but breathing, turn patient on their side to maintain open airways.',
      '5. Campus Dispensary: Staffed 24×7 with emergency nurse, duty doctor and ambulance van near Hostel Circle.',
    ],
  },
  {
    id: 'confidential',
    title: 'Anti-Ragging & Student Protection',
    icon: '🛡️',
    summary: 'Zero-tolerance policy, confidential reporting channels and committee contacts.',
    content: [
      '1. Strict zero tolerance: Any form of harassment, verbal abuse, or forced servitude is strictly prohibited.',
      '2. Confidential reporting: CampusShield encrypts all incident notes and preserves reporter confidentiality.',
      '3. 24×7 Toll-Free helpline: Call the National Anti-Ragging Helpline at 1800-180-5522 anytime.',
      '4. Campus Committee: BIT Sindri Anti-Ragging Squad conducts unannounced rounds across hostel clusters.',
      '5. Counseling support: Student Welfare Center provides confidential mental health and peer counseling.',
    ],
  },
];

/** Profile / notification preferences / security / medical records / logout / safety guides. */
function Profile() {
  const { user, signOut, updateNotificationPrefs } = useAuth();
  const c = useTheme();
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();

  const prefs = user?.notificationPrefs || {};

  // Change password state
  const [pwOpen, setPwOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState(null);
  const [pwFieldErrors, setPwFieldErrors] = useState({});

  // Push alerts state
  const [pushState, setPushState] = useState('idle');
  const [selectedGuide, setSelectedGuide] = useState(null);

  // Editable Medical Record State
  const [medical, setMedical] = useState(DEFAULT_MEDICAL);
  const [medModalOpen, setMedModalOpen] = useState(false);
  const [editBlood, setEditBlood] = useState(DEFAULT_MEDICAL.bloodGroup);
  const [editAllergies, setEditAllergies] = useState(DEFAULT_MEDICAL.allergies);
  const [editConditions, setEditConditions] = useState(DEFAULT_MEDICAL.chronicConditions);
  const [editMedications, setEditMedications] = useState(DEFAULT_MEDICAL.medications);
  const [editContactName, setEditContactName] = useState(DEFAULT_MEDICAL.emergencyContactName);
  const [editContactPhone, setEditContactPhone] = useState(DEFAULT_MEDICAL.emergencyContactPhone);
  const [editNotes, setEditNotes] = useState(DEFAULT_MEDICAL.medicalNotes);
  const [medSaving, setMedSaving] = useState(false);

  // Load persisted medical profile
  useEffect(() => {
    (async () => {
      try {
        const key = `campus_medical_profile_${user?.id || 'default'}`;
        const raw = await storage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          setMedical((prev) => ({ ...prev, ...parsed }));
        }
      } catch (e) {
        // Fallback to default
      }
    })();
  }, [user?.id]);

  const openEditMedical = () => {
    setEditBlood(medical.bloodGroup || 'O+');
    setEditAllergies(medical.allergies || '');
    setEditConditions(medical.chronicConditions || '');
    setEditMedications(medical.medications || '');
    setEditContactName(medical.emergencyContactName || '');
    setEditContactPhone(medical.emergencyContactPhone || '');
    setEditNotes(medical.medicalNotes || '');
    setMedModalOpen(true);
  };

  const saveMedicalRecord = async () => {
    setMedSaving(true);
    try {
      const nowStr = new Date().toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
      const updated = {
        ...medical,
        bloodGroup: editBlood,
        allergies: editAllergies.trim() || 'None reported',
        chronicConditions: editConditions.trim() || 'None',
        medications: editMedications.trim() || 'None',
        emergencyContactName: editContactName.trim() || 'Campus Guardian / Parent',
        emergencyContactPhone: editContactPhone.trim() || '+91 94311 23456',
        medicalNotes: editNotes.trim() || 'No additional directives recorded.',
        updatedAt: nowStr,
      };
      const key = `campus_medical_profile_${user?.id || 'default'}`;
      await storage.setItem(key, JSON.stringify(updated));
      setMedical(updated);
      setMedModalOpen(false);
      toast.success('Medical Record Saved ✅', 'Emergency medical profile updated successfully.');
    } catch (e) {
      toast.error('Save failed', e.message);
    } finally {
      setMedSaving(false);
    }
  };

  const logout = async () => {
    const ok = await confirm({
      title: 'Sign out?',
      message: 'You will need to sign in again to report incidents or send SOS alerts.',
      confirmLabel: 'Sign out',
      danger: true,
    });
    if (!ok) return;
    await signOut();
    router.replace('/login');
  };

  const validatePw = () => {
    const errs = {};
    if (!currentPassword) errs.currentPassword = 'Enter your current password.';
    if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      errs.newPassword = 'At least 8 characters with a letter and a number.';
    }
    if (newPassword !== confirmPassword) errs.confirmPassword = 'Passwords do not match.';
    setPwFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const changePassword = async () => {
    setPwError(null);
    if (!validatePw()) return;
    setPwBusy(true);
    try {
      await api('/api/auth/password', {
        method: 'PATCH',
        body: { currentPassword, newPassword },
      });
      setPwOpen(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      const ok = await confirm({
        title: 'Password changed ✅',
        message: 'All other devices have been signed out. For your safety you will now sign in again on this one.',
        confirmLabel: 'Sign in',
        cancelLabel: 'Later',
      });
      if (ok) signOutAndGo();
    } catch (e) {
      setPwError(e.message);
    } finally {
      setPwBusy(false);
    }
  };

  const signOutAndGo = async () => {
    await signOut();
    router.replace('/login');
  };

  const enablePush = async () => {
    setPushState('busy');
    const result = await requestAndRegisterPushToken();
    if (result.ok) {
      setPushState('on');
      const msg = result.isLocalFallback
        ? (result.message || 'Alerts active! Your phone will sound and display notifications for SOS alerts.')
        : 'You will now receive push notifications for SOS alerts, report updates and announcements.';
      toast.success('Alerts enabled ✅', msg);
    } else {
      setPushState('off');
      toast.error('Could not enable alerts', result.reason || 'Please try again.');
    }
  };

  const togglePref = (key, label) => async (value) => {
    try {
      await updateNotificationPrefs({ [key]: value });
      if (!value) toast.info(`${label} muted`, 'You can re-enable it any time.');
    } catch (e) {
      toast.error('Could not save preference', e.message);
    }
  };

  const checkPushStatus = async () => {
    if (!Device.isDevice) {
      setPushState('off');
      return;
    }
    try {
      const settings = await Notifications.getPermissionsAsync();
      setPushState(settings.granted ? 'on' : 'off');
    } catch (e) {
      setPushState('off');
    }
  };

  useEffect(() => {
    checkPushStatus();
  }, []);

  const PrefRow = ({ icon, title, sub, value, onToggle, disabled }) => (
    <View style={[styles.prefRow, disabled && { opacity: 0.55 }]}>
      <Text style={{ fontSize: 20 }}>{icon}</Text>
      <View style={{ flex: 1, marginHorizontal: spacing.m }}>
        <Text style={[styles.prefTitle, { color: c.text }]}>{title}</Text>
        <Text style={[styles.prefSub, { color: c.sub }]}>{sub}</Text>
      </View>
      <Switch
        value={!!value}
        onValueChange={onToggle}
        disabled={disabled}
        trackColor={{ false: c.border, true: c.primary }}
        accessibilityLabel={title}
      />
    </View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.background }]}>
      <View style={{ maxWidth: 640, width: '100%', alignSelf: 'center' }}>
        <ScreenHeader title="Profile & Settings" onBack={true} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* User Card */}
        <Card style={styles.userCard}>
          <View style={[styles.avatar, { backgroundColor: c.primarySoft }]}>
            <Text style={[styles.avatarText, { color: c.primaryDark }]}>{user?.name?.[0]?.toUpperCase() || '?'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: c.text }]}>{user?.name}</Text>
            <Text style={[styles.email, { color: c.sub }]}>{user?.email}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.s, flexWrap: 'wrap' }}>
              <RoleBadge role={user?.role} />
              <VerificationBadge status={user?.verificationStatus} />
            </View>
          </View>
        </Card>

        {/* ── Verified Campus Credentials ── */}
        <View style={styles.sectionHeaderRow}>
          <SectionTitle>Campus credentials</SectionTitle>
          <PressableScale onPress={() => router.push('/verification')} accessibilityLabel="Manage verification details">
            <View style={[styles.editMedPill, { backgroundColor: c.cardElevated, borderColor: c.primary }]}>
              <Text style={[styles.editMedPillText, { color: c.primary }]}>📋 Verification Portal</Text>
            </View>
          </PressableScale>
        </View>
        <Card>
          <View style={styles.credentialGrid}>
            <View style={styles.credItem}>
              <Text style={[styles.credLabel, { color: c.faint }]}>INSTITUTION</Text>
              <Text style={[styles.credVal, { color: c.text }]}>BIT Sindri, Dhanbad</Text>
            </View>
            <View style={styles.credItem}>
              <Text style={[styles.credLabel, { color: c.faint }]}>CAMPUS ID / ROLL</Text>
              <Text style={[styles.credVal, { color: c.text }]}>
                {user?.studentId || 'Not submitted yet'}
              </Text>
            </View>
            <View style={styles.credItem}>
              <Text style={[styles.credLabel, { color: c.faint }]}>DEPARTMENT</Text>
              <Text style={[styles.credVal, { color: c.text }]}>
                {user?.department || 'General Campus'}
              </Text>
            </View>
            <View style={styles.credItem}>
              <Text style={[styles.credLabel, { color: c.faint }]}>DESIGNATION</Text>
              <Text style={[styles.credVal, { color: c.text }]}>
                {user?.designation || (user?.role === 'STUDENT' ? 'Student' : user?.role)}
              </Text>
            </View>
            {user?.hostelName || user?.roomOrOffice ? (
              <View style={styles.credItem}>
                <Text style={[styles.credLabel, { color: c.faint }]}>HOSTEL / OFFICE</Text>
                <Text style={[styles.credVal, { color: c.text }]}>
                  {user?.hostelName || user?.roomOrOffice}
                </Text>
              </View>
            ) : null}
            <View style={styles.credItem}>
              <Text style={[styles.credLabel, { color: c.faint }]}>SAFETY STATUS</Text>
              <Text style={[styles.credVal, { color: c.success }]}>● Active SecureByte Protection</Text>
            </View>
          </View>
        </Card>

        {/* ── Emergency Medical Record (Editable) ── */}
        <View style={styles.sectionHeaderRow}>
          <SectionTitle>Emergency medical record</SectionTitle>
          <PressableScale onPress={openEditMedical} accessibilityLabel="Edit medical record">
            <View style={[styles.editMedPill, { backgroundColor: c.cardElevated, borderColor: c.primary }]}>
              <Text style={[styles.editMedPillText, { color: c.primary }]}>✏️ Edit Record</Text>
            </View>
          </PressableScale>
        </View>
        <Card>
          <View style={styles.medHeaderRow}>
            <View style={styles.medTitleBlock}>
              <Text style={{ fontSize: 22, marginRight: 8 }}>🩺</Text>
              <View>
                <Text style={[styles.medTitle, { color: c.text }]}>Campus Health Record</Text>
                <Text style={[styles.medSub, { color: c.faint }]}>ID: {medical.clinicCardNo} · Updated {medical.updatedAt}</Text>
              </View>
            </View>
            <View style={[styles.bloodBadge, { backgroundColor: '#FEE2E2', borderColor: '#EF4444' }]}>
              <Text style={[styles.bloodBadgeText, { color: '#B91C1C' }]}>🩸 {medical.bloodGroup}</Text>
            </View>
          </View>

          <View style={[styles.medDivider, { borderColor: c.border }]} />

          <View style={styles.medGrid}>
            <View style={styles.medGridItem}>
              <Text style={[styles.medFieldLabel, { color: c.faint }]}>ALLERGIES</Text>
              <Text style={[styles.medFieldVal, { color: medical.allergies === 'None reported' ? c.text : '#DC2626' }]}>
                {medical.allergies}
              </Text>
            </View>
            <View style={styles.medGridItem}>
              <Text style={[styles.medFieldLabel, { color: c.faint }]}>CHRONIC CONDITIONS</Text>
              <Text style={[styles.medFieldVal, { color: c.text }]}>{medical.chronicConditions}</Text>
            </View>
            <View style={styles.medGridItem}>
              <Text style={[styles.medFieldLabel, { color: c.faint }]}>CURRENT MEDICATIONS</Text>
              <Text style={[styles.medFieldVal, { color: c.text }]}>{medical.medications}</Text>
            </View>
            <View style={styles.medGridItem}>
              <Text style={[styles.medFieldLabel, { color: c.faint }]}>EMERGENCY CONTACT</Text>
              <Text style={[styles.medFieldVal, { color: c.text }]}>
                {medical.emergencyContactName} ({medical.emergencyContactPhone})
              </Text>
            </View>
          </View>

          {medical.medicalNotes ? (
            <View style={[styles.medNotesBox, { backgroundColor: c.background, borderColor: c.border }]}>
              <Text style={[styles.medFieldLabel, { color: c.faint, marginBottom: 2 }]}>FIRST AID DIRECTIVES</Text>
              <Text style={[styles.medNotesText, { color: c.sub }]}>{medical.medicalNotes}</Text>
            </View>
          ) : null}

          <View style={styles.medActionRow}>
            <PressableScale
              onPress={() => Linking.openURL('tel:+919431123456')}
              style={[styles.medDispensaryBtn, { backgroundColor: '#DC2626' }]}
              accessibilityLabel="Call BIT Sindri Dispensary"
            >
              <Text style={styles.medDispensaryText}>🚑 Call BIT Dispensary (+91 94311 23456)</Text>
            </PressableScale>
          </View>
        </Card>

        {/* ── Campus Emergency Safety Protocols (Interactive) ── */}
        <SectionTitle>Campus emergency protocols</SectionTitle>
        <Card>
          <Text style={[styles.infoText, { color: c.sub, marginBottom: spacing.m }]}>
            Official BIT Sindri safety guides and emergency protocols. Tap any guide to read:
          </Text>
          {SAFETY_GUIDES.map((g, i) => (
            <PressableScale key={g.id} onPress={() => setSelectedGuide(g)} accessibilityLabel={g.title}>
              <View
                style={[
                  styles.guideRow,
                  { borderColor: c.border },
                  i < SAFETY_GUIDES.length - 1 && styles.guideBorder,
                ]}
              >
                <Text style={{ fontSize: 24, marginRight: 12 }}>{g.icon}</Text>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={[styles.guideTitle, { color: c.text }]}>{g.title}</Text>
                  <Text style={[styles.guideSub, { color: c.faint }]} numberOfLines={1}>
                    {g.summary}
                  </Text>
                </View>
                <Text style={[styles.guideArrow, { color: c.primary }]}>→</Text>
              </View>
            </PressableScale>
          ))}
        </Card>

        {/* ── Notification Preferences ── */}
        <SectionTitle>Notification preferences</SectionTitle>
        <Card>
          <PrefRow
            icon="🔔"
            title="Push notifications"
            sub={pushState === 'on' ? 'Device alerts are ON' : 'Device alerts are off — enable below'}
            value={pushState === 'on'}
            onToggle={pushState === 'on' ? undefined : enablePush}
            disabled={pushState === 'busy' || pushState === 'on'}
          />
          <View style={[styles.divider, { borderColor: c.border }]} />
          <PrefRow
            icon="🆘"
            title="SOS & help alerts"
            sub="Critical SOS alerts and emergency broadcasts"
            value={prefs.sosAlerts !== false}
            onToggle={togglePref('sosAlerts', 'SOS alerts')}
          />
          <View style={[styles.divider, { borderColor: c.border }]} />
          <PrefRow
            icon="🔄"
            title="My report updates"
            sub="Status changes on reports you filed"
            value={prefs.statusUpdates !== false}
            onToggle={togglePref('statusUpdates', 'Report updates')}
          />
          <View style={[styles.divider, { borderColor: c.border }]} />
          <PrefRow
            icon="📢"
            title="Safety announcements"
            sub="Campus-wide safety broadcasts"
            value={prefs.announcements !== false}
            onToggle={togglePref('announcements', 'Announcements')}
          />
        </Card>

        {/* ── Account Security ── */}
        <SectionTitle>Account security</SectionTitle>
        <Card>
          {!pwOpen ? (
            <>
              <Text style={[styles.infoText, { color: c.sub }]}>
                Change your password any time — changing it signs out every other device automatically.
              </Text>
              <Button title="Change password" variant="outline" onPress={() => setPwOpen(true)} style={{ marginTop: spacing.m }} />
            </>
          ) : (
            <>
              <ErrorBanner message={pwError} />
              <Input label="Current password" placeholder="Your current password" secureTextEntry value={currentPassword} onChangeText={setCurrentPassword} error={pwFieldErrors.currentPassword} />
              <Input label="New password" placeholder="8+ chars, letter + number" secureTextEntry value={newPassword} onChangeText={setNewPassword} error={pwFieldErrors.newPassword} />
              <Input label="Confirm new password" placeholder="Repeat the new password" secureTextEntry value={confirmPassword} onChangeText={setConfirmPassword} error={pwFieldErrors.confirmPassword} />
              <View style={styles.pwButtons}>
                <Button title={pwBusy ? 'Saving…' : 'Save new password'} onPress={changePassword} loading={pwBusy} style={{ flex: 1 }} />
                <Button
                  title="Cancel"
                  variant="ghost"
                  onPress={() => {
                    setPwOpen(false);
                    setPwError(null);
                    setPwFieldErrors({});
                  }}
                  style={{ flex: 1 }}
                />
              </View>
            </>
          )}
        </Card>

        {/* ── About This App ── */}
        <SectionTitle>About SecureByte</SectionTitle>
        <Card>
          <Text style={[styles.infoText, { color: c.sub }]}>
            <Text style={{ color: c.text, fontWeight: '700' }}>SecureByte CampusShield v3.2.0</Text> — Developed for Hacktoberfest Hack Day Dhanbad 2026 (Track 2: Campus Emergency & Safety).
          </Text>
          <Text style={[styles.infoText, { color: c.sub, marginTop: spacing.s }]}>
            Features real-time GPS location telemetry, instant multi-channel push dispatch, verified campus landmark mapping, editable emergency medical health profiles, and role-based incident triage console.
          </Text>
        </Card>

        <Button title="Sign out" variant="outline" onPress={logout} style={{ marginTop: spacing.xl, borderColor: c.danger }} />
        <Button title="Close" variant="ghost" onPress={() => router.back()} style={{ marginTop: spacing.s }} />
      </ScrollView>

      {/* ── Edit Medical Record Modal ── */}
      <Modal
        visible={medModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setMedModalOpen(false)}
      >
        <View style={[styles.modalBackdrop, { backgroundColor: c.overlay }]}>
          <View style={[styles.modalSheet, { backgroundColor: c.cardElevated, maxHeight: '85%' }]}>
            <View style={styles.modalTopRow}>
              <View>
                <Text style={[styles.modalGuideTitle, { color: c.text }]}>Edit Emergency Medical Record</Text>
                <Text style={[styles.modalGuideSub, { color: c.sub }]}>
                  Used by BIT Dispensary paramedics & first responders during emergencies.
                </Text>
              </View>
              <Pressable onPress={() => setMedModalOpen(false)} hitSlop={10}>
                <Text style={{ fontSize: 18, color: c.faint, fontWeight: '700' }}>✕</Text>
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ marginVertical: spacing.m }}>
              <Text style={[styles.modalInputLabel, { color: c.text }]}>Blood Group</Text>
              <View style={styles.bloodChipRow}>
                {BLOOD_GROUPS.map((bg) => {
                  const sel = editBlood === bg;
                  return (
                    <Pressable
                      key={bg}
                      onPress={() => setEditBlood(bg)}
                      style={[
                        styles.bloodChip,
                        {
                          backgroundColor: sel ? '#DC2626' : c.card,
                          borderColor: sel ? '#991B1B' : c.border,
                        },
                      ]}
                    >
                      <Text style={[styles.bloodChipText, { color: sel ? '#FFFFFF' : c.text }]}>{bg}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[styles.modalInputLabel, { color: c.text, marginTop: 12 }]}>Known Allergies</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: c.card, borderColor: c.border, color: c.text }]}
                placeholder="e.g. Penicillin, Peanuts, Sulfa (or 'None')"
                placeholderTextColor={c.faint}
                value={editAllergies}
                onChangeText={setEditAllergies}
              />

              <Text style={[styles.modalInputLabel, { color: c.text, marginTop: 12 }]}>Chronic Conditions / Alerts</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: c.card, borderColor: c.border, color: c.text }]}
                placeholder="e.g. Asthma, Type 1 Diabetes, Epilepsy (or 'None')"
                placeholderTextColor={c.faint}
                value={editConditions}
                onChangeText={setEditConditions}
              />

              <Text style={[styles.modalInputLabel, { color: c.text, marginTop: 12 }]}>Current Medications</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: c.card, borderColor: c.border, color: c.text }]}
                placeholder="e.g. Inhaler, Insulin, Antihistamines"
                placeholderTextColor={c.faint}
                value={editMedications}
                onChangeText={setEditMedications}
              />

              <Text style={[styles.modalInputLabel, { color: c.text, marginTop: 12 }]}>Emergency Contact Name</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: c.card, borderColor: c.border, color: c.text }]}
                placeholder="e.g. Father, Mother, Campus Guardian"
                placeholderTextColor={c.faint}
                value={editContactName}
                onChangeText={setEditContactName}
              />

              <Text style={[styles.modalInputLabel, { color: c.text, marginTop: 12 }]}>Emergency Contact Phone</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: c.card, borderColor: c.border, color: c.text }]}
                placeholder="+91 94311 23456"
                placeholderTextColor={c.faint}
                keyboardType="phone-pad"
                value={editContactPhone}
                onChangeText={setEditContactPhone}
              />

              <Text style={[styles.modalInputLabel, { color: c.text, marginTop: 12 }]}>First Aid / Paramedic Notes</Text>
              <TextInput
                style={[
                  styles.modalInput,
                  styles.modalTextArea,
                  { backgroundColor: c.card, borderColor: c.border, color: c.text },
                ]}
                placeholder="Important directives for responding medics..."
                placeholderTextColor={c.faint}
                multiline
                numberOfLines={3}
                value={editNotes}
                onChangeText={setEditNotes}
              />
            </ScrollView>

            <View style={styles.modalBtnRow}>
              <Button
                title={medSaving ? 'Saving…' : 'Save Medical Record'}
                onPress={saveMedicalRecord}
                loading={medSaving}
                style={{ flex: 1 }}
              />
              <Button
                title="Cancel"
                variant="ghost"
                onPress={() => setMedModalOpen(false)}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Guide Modal ── */}
      <Modal
        visible={!!selectedGuide}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedGuide(null)}
      >
        <View style={[styles.modalBackdrop, { backgroundColor: c.overlay }]}>
          <View style={[styles.modalSheet, { backgroundColor: c.cardElevated }]}>
            {selectedGuide && (
              <>
                <View style={styles.modalTopRow}>
                  <Text style={{ fontSize: 26 }}>{selectedGuide.icon}</Text>
                  <Pressable onPress={() => setSelectedGuide(null)} hitSlop={10}>
                    <Text style={{ fontSize: 18, color: c.faint, fontWeight: '700' }}>✕</Text>
                  </Pressable>
                </View>
                <Text style={[styles.modalGuideTitle, { color: c.text }]}>{selectedGuide.title}</Text>
                <Text style={[styles.modalGuideSub, { color: c.sub }]}>{selectedGuide.summary}</Text>

                <ScrollView style={{ maxHeight: 280, marginVertical: spacing.m }}>
                  {selectedGuide.content.map((point, idx) => (
                    <Text key={idx} style={[styles.guidePoint, { color: c.text }]}>
                      {point}
                    </Text>
                  ))}
                </ScrollView>

                <Button title="Close guide" variant="primary" onPress={() => setSelectedGuide(null)} />
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

export default function ProfileScreen() {
  return (
    <AuthGate>
      <Profile />
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: spacing.l, paddingBottom: spacing.xxl, maxWidth: 640, width: '100%', alignSelf: 'center' },
  userCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.l },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  avatarText: { fontSize: 28, fontWeight: '800' },
  name: { ...type.headline, fontSize: 19, letterSpacing: -0.3 },
  email: { fontSize: 13.5, marginTop: 3 },
  credentialGrid: { gap: 12 },
  credItem: { paddingBottom: 6 },
  credLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  credVal: { fontSize: 14, fontWeight: '600', marginTop: 3 },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.l,
    marginBottom: spacing.s,
  },
  editMedPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1.2,
  },
  editMedPillText: {
    fontSize: 12.5,
    fontWeight: '800',
  },
  medHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  medTitleBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  medTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  medSub: {
    fontSize: 11.5,
    marginTop: 2,
  },
  bloodBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  bloodBadgeText: {
    fontSize: 13,
    fontWeight: '800',
  },
  medDivider: {
    borderTopWidth: 1,
    marginVertical: spacing.m,
  },
  medGrid: {
    gap: 10,
  },
  medGridItem: {
    paddingBottom: 4,
  },
  medFieldLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  medFieldVal: {
    fontSize: 13.5,
    fontWeight: '600',
    marginTop: 2,
  },
  medNotesBox: {
    borderWidth: 1,
    borderRadius: radius.m,
    padding: spacing.m,
    marginTop: spacing.m,
  },
  medNotesText: {
    fontSize: 12.5,
    lineHeight: 18,
  },
  medActionRow: {
    marginTop: spacing.m,
  },
  medDispensaryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medDispensaryText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  bloodChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  bloodChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.s,
    borderWidth: 1,
  },
  bloodChipText: {
    fontSize: 13,
    fontWeight: '800',
  },
  modalInputLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: radius.m,
    paddingHorizontal: spacing.m,
    paddingVertical: 8,
    fontSize: 13.5,
    marginTop: 4,
  },
  modalTextArea: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: spacing.s,
    marginTop: spacing.m,
  },
  guideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.m,
  },
  guideBorder: { borderBottomWidth: 1 },
  guideTitle: { fontSize: 14, fontWeight: '700' },
  guideSub: { fontSize: 12, marginTop: 2 },
  guideArrow: { fontSize: 18, fontWeight: '800' },
  prefRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.s },
  prefTitle: { ...type.bodyStrong, fontSize: 14 },
  prefSub: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  divider: { borderTopWidth: 1, marginVertical: spacing.xs },
  pwButtons: { flexDirection: 'row', gap: spacing.s, marginTop: spacing.m },
  infoText: { fontSize: 13.5, lineHeight: 21 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end' },
  modalSheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  modalTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.s },
  modalGuideTitle: { ...type.headline, fontSize: 17, lineHeight: 22 },
  modalGuideSub: { fontSize: 12.5, marginTop: 3, lineHeight: 17 },
  guidePoint: { fontSize: 13.5, lineHeight: 21, marginBottom: 10 },
});
