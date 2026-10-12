import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
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
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { api, apiUpload } from '../src/api/client';
import { enqueueIncident } from '../src/utils/outboxQueue';
import { isDeviceOffline } from '../src/utils/network';
import { AuthGate } from '../src/components/Gate';
import ScreenHeader from '../src/components/ScreenHeader';
import Card from '../src/components/Card';
import Button from '../src/components/Button';
import Input from '../src/components/Input';
import PressableScale from '../src/components/PressableScale';
import { ErrorBanner } from '../src/components/Feedback';
import { useConfirm } from '../src/components/ConfirmDialog';
import { useToast } from '../src/components/Toast';
import { useLocation } from '../src/hooks/useLocation';
import {
  MASTER_CATEGORIES,
  getRecommendedPriority,
  searchIncidentCategories,
} from '../src/data/incidentCategories';
import {
  CAMPUS_BOUNDARY,
  evaluateLocationDiscrepancy,
  findLandmarkCoords,
  isWithinCampus,
} from '../src/utils/geoUtils';
import { radius, spacing, type } from '../src/theme';
import { useTheme } from '../src/hooks/useTheme';

const SENSITIVE_CATEGORIES = [
  { value: 'HARASSMENT', label: 'Harassment & Bullying', icon: '🛑', desc: 'Hostile conduct, intimidation or persistent targeting' },
  { value: 'THREATS_INTIMIDATION', label: 'Threats / Intimidation', icon: '⚠️', desc: 'Direct threats of harm, extortion or black-listing' },
  { value: 'ABUSE_OF_AUTHORITY', label: 'Abuse of Authority', icon: '⚖️', desc: 'Misuse of official position, grading or committee power' },
  { value: 'FACULTY_STAFF_MISCONDUCT', label: 'Faculty / Staff Misconduct', icon: '🏛️', desc: 'Unethical conduct, exploitation or gross misconduct' },
  { value: 'OTHER_SENSITIVE', label: 'Other Sensitive Incident', icon: '🔒', desc: 'High-sensitivity matter needing protected triage' },
];

const PRIORITIES = [
  { value: 'LOW', label: 'Low', icon: '🟢', desc: 'Non-urgent maintenance or inquiry' },
  { value: 'MEDIUM', label: 'Medium', icon: '🟡', desc: 'Standard security & safety concern' },
  { value: 'HIGH', label: 'High', icon: '🔴', desc: 'Urgent risk, injury or active incident' },
];

const CAMPUS_PRESETS = [
  'Senior Hostel Block 7',
  'Senior Hostel Block 8',
  'Junior Hostel Complex',
  'Deshpande Central Library',
  'Academic Wing Lab 204',
  'BIT Dispensary Clinic',
  'Sports Pavilion & Oval',
  'Main Security Gate',
  'Hostel Circle 4',
  'Student Center Canteen',
  'Electrical Dept Quad',
  'Administrative Main Block',
];

function Report() {
  const router = useRouter();
  const c = useTheme();
  const toast = useToast();
  const confirm = useConfirm();
  const location = useLocation();

  // Search & Master Category State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMaster, setSelectedMaster] = useState(MASTER_CATEGORIES[0]); // Default to Ragging
  const [selectedSubcategory, setSelectedSubcategory] = useState(MASTER_CATEGORIES[0].subcategories[0]);

  // Form Fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('HIGH');
  const [isConfidential, setIsConfidential] = useState(true);
  const [includeLocation, setIncludeLocation] = useState(false);
  const [campusLandmark, setCampusLandmark] = useState('');
  const [buildingOrRoom, setBuildingOrRoom] = useState('');
  const [photo, setPhoto] = useState(null);

  // Sensitive / Confidential Complaints State
  const [isSensitive, setIsSensitive] = useState(false);
  const [sensitiveCategory, setSensitiveCategory] = useState(SENSITIVE_CATEGORIES[0].value);
  const [accusedPerson, setAccusedPerson] = useState('');
  const [accusedDepartment, setAccusedDepartment] = useState('');
  const [confidentialityNoticeAcknowledged, setConfidentialityNoticeAcknowledged] = useState(false);

  // Location Verification & Discrepancy State
  const [currentGpsCoords, setCurrentGpsCoords] = useState(null);
  const [selectedCoords, setSelectedCoords] = useState(null);
  const [mismatchConfirmed, setMismatchConfirmed] = useState(false);

  // Status & Validation
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  // Filtered categories based on search
  const visibleCategories = useMemo(() => {
    return searchIncidentCategories(searchQuery);
  }, [searchQuery]);

  // Real-time Discrepancy & Geofence Checks
  const discrepancy = useMemo(() => {
    if (!includeLocation || !currentGpsCoords || !selectedCoords) return null;
    return evaluateLocationDiscrepancy({
      currentCoords: currentGpsCoords,
      selectedCoords,
      thresholdMeters: 400,
      maxAccuracyMeters: 150,
    });
  }, [includeLocation, currentGpsCoords, selectedCoords]);

  const isLocationOutsideCampus = useMemo(() => {
    const target = selectedCoords || currentGpsCoords;
    if (!target?.latitude || !target?.longitude) return false;
    return !isWithinCampus(target.latitude, target.longitude);
  }, [selectedCoords, currentGpsCoords]);

  // Handle Master Category Change
  const handleSelectMaster = (cat) => {
    setSelectedMaster(cat);
    const defaultSub = cat.subcategories[0] || '';
    setSelectedSubcategory(defaultSub);

    // Auto-suggest risk-based priority
    const recPri = getRecommendedPriority(cat, defaultSub);
    setPriority(recPri);

    // Auto-set confidential default if sensitive
    setIsConfidential(Boolean(cat.isConfidentialRecommended));

    // Auto-fill a clean title starter if title is empty or was previously auto-filled
    if (!title || title.startsWith('[')) {
      setTitle(`[${cat.label.split('&')[0].trim()}] `);
    }

    Haptics.selectionAsync().catch(() => {});
  };

  // Handle Subcategory Change
  const handleSelectSub = (sub) => {
    setSelectedSubcategory(sub);
    const recPri = getRecommendedPriority(selectedMaster, sub);
    setPriority(recPri);

    // Update title starter
    const shortSub = sub.split('/')[0].trim();
    setTitle(`[${selectedMaster.label.split('&')[0].trim()}: ${shortSub}] `);

    Haptics.selectionAsync().catch(() => {});
  };

  const handleToggleLocation = async (enabled) => {
    setIncludeLocation(enabled);
    if (enabled) {
      const res = await location.request();
      const coords = res?.coords || location.coords;
      if (coords) {
        setCurrentGpsCoords(coords);
      }
    } else {
      setCurrentGpsCoords(null);
    }
    Haptics.selectionAsync().catch(() => {});
  };

  const validate = () => {
    const errs = {};
    if (title.trim().length < 5) errs.title = 'Title must be at least 5 characters.';
    if (description.trim().length < 10)
      errs.description = 'Describe the incident clearly (at least 10 characters).';
    if (campusLandmark.trim().length > 0 && campusLandmark.trim().length < 3) {
      errs.campusLandmark = 'Campus landmark must be at least 3 characters.';
    }
    if (isSensitive && !confidentialityNoticeAcknowledged) {
      errs.confidentialityNotice = 'Please acknowledge the confidentiality & independent review notice before submitting.';
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      toast.info('Permission needed', 'Allow photo access to attach evidence, or submit without a photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsMultipleSelection: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
      toast.error('Photo too large', 'Pick an image smaller than 5 MB.');
      return;
    }
    const ext = (asset.uri.split('.').pop() || 'jpg').toLowerCase();
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    setPhoto({ uri: asset.uri, name: `evidence.${ext === 'jpeg' ? 'jpg' : ext}`, type: mime });
    Haptics.selectionAsync().catch(() => {});
  };

  const removePhoto = async () => {
    const ok = await confirm({ title: 'Remove the attached photo?', confirmLabel: 'Remove' });
    if (ok) setPhoto(null);
  };

  const applyLandmarkPreset = (preset) => {
    setCampusLandmark(preset);
    const resolved = findLandmarkCoords(preset);
    if (resolved) {
      setSelectedCoords({ latitude: resolved.latitude, longitude: resolved.longitude });
    } else {
      setSelectedCoords(null);
    }
    setMismatchConfirmed(false);
    Haptics.selectionAsync().catch(() => {});
  };

  const handleUseCurrentLocation = () => {
    if (currentGpsCoords) {
      setSelectedCoords({ latitude: currentGpsCoords.latitude, longitude: currentGpsCoords.longitude });
      setCampusLandmark('Current GPS Fix');
      setMismatchConfirmed(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  };

  const submit = async () => {
    setError(null);
    if (!validate()) return;
    setSubmitting(true);

    let incidentPayload = null;
    try {
      const locPayload = {};

      // Current GPS metadata
      if (includeLocation && currentGpsCoords) {
        locPayload.currentLatitude = currentGpsCoords.latitude;
        locPayload.currentLongitude = currentGpsCoords.longitude;
        locPayload.gpsAccuracy = currentGpsCoords.accuracy ?? null;
      }

      // Incident location resolution
      if (selectedCoords) {
        locPayload.selectedLatitude = selectedCoords.latitude;
        locPayload.selectedLongitude = selectedCoords.longitude;
        locPayload.latitude = selectedCoords.latitude;
        locPayload.longitude = selectedCoords.longitude;
        locPayload.locationSource = 'LANDMARK';
      } else if (includeLocation && currentGpsCoords) {
        locPayload.latitude = currentGpsCoords.latitude;
        locPayload.longitude = currentGpsCoords.longitude;
        locPayload.locationSource = 'GPS';
      } else if (campusLandmark.trim().length >= 3) {
        locPayload.locationSource = 'MANUAL';
      } else {
        locPayload.locationSource = 'UNAVAILABLE';
      }

      if (campusLandmark.trim().length >= 3) {
        locPayload.campusLandmark = campusLandmark.trim();
      }
      if (buildingOrRoom.trim().length >= 2) {
        locPayload.buildingOrRoom = buildingOrRoom.trim();
      }
      if (mismatchConfirmed) {
        locPayload.mismatchConfirmed = true;
      }

      const hasLocation = Object.keys(locPayload).length > 0;

      // Construct rich description
      const structuredHeader = [
        isSensitive ? `[Confidential Sensitive Case: ${sensitiveCategory}]` : `[Category: ${selectedMaster.label}]`,
        `[Subcategory: ${selectedSubcategory}]`,
        accusedPerson.trim() ? `[Accused: ${accusedPerson.trim()}]` : null,
        accusedDepartment.trim() ? `[Unit: ${accusedDepartment.trim()}]` : null,
        isConfidential || isSensitive ? '[Independent Escalation: ACTIVE]' : null,
      ]
        .filter(Boolean)
        .join(' ');

      const fullDescription = `${structuredHeader}\n\n${description.trim()}`;

      incidentPayload = {
        title: title.trim(),
        description: fullDescription,
        category: isSensitive ? 'HARASSMENT' : selectedMaster.backendCategory,
        priority,
        isSos: false,
        ...(hasLocation ? { location: locPayload } : {}),
        ...(isSensitive
          ? {
              isSensitive: true,
              sensitiveCategory,
              accusedPerson: accusedPerson.trim() || null,
              accusedDepartment: accusedDepartment.trim() || null,
              confidentialityNoticeAcknowledged: Boolean(confidentialityNoticeAcknowledged),
            }
          : {}),
      };

      const data = await api('/api/incidents', {
        method: 'POST',
        body: incidentPayload,
      });

      // Photo evidence upload (best-effort)
      if (photo && data.incident?.id) {
        setUploading(true);
        try {
          await apiUpload(`/api/incidents/${data.incident.id}/photo`, photo);
        } catch (uploadErr) {
          toast.info('Report saved — photo upload failed', 'You can retry from the report detail screen.');
          router.replace(`/incident/${data.incident.id}`);
          return;
        } finally {
          setUploading(false);
        }
      }

      toast.success(
        isSensitive ? 'Confidential Case Transmitted 🛡️' : 'Incident Report Submitted ✅',
        isSensitive
          ? 'Routed directly to the Independent Review Board & Director.'
          : 'Routed to campus safety responders & grievance committees.'
      );
      router.replace('/my-reports');
    } catch (e) {
      const trulyOffline = await isDeviceOffline();
      if (incidentPayload && trulyOffline) {
        await enqueueIncident(incidentPayload);
        toast.info('Saved to Offline Outbox 💾', 'No internet connection detected. Your report is saved locally and will automatically sync once connected.');
        router.replace('/my-reports');
        return;
      }

      // If internet is active, show the actual error and provide retry
      setError(
        e.code === 'NETWORK_ERROR'
          ? 'Cannot reach the SecureByte server. Please ensure the backend server is running and reachable, or tap Retry.'
          : e.message || 'Submission failed. Please check the details.'
      );
      if (e.details) setFieldErrors(e.details);
      toast.error('Submission Failed', e.message || 'Server connection error.');
    } finally {
      setSubmitting(false);
    }
  };

  const busy = submitting || uploading;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'android' ? undefined : 'padding'} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { maxWidth: 680, width: '100%', alignSelf: 'center' }]}
          keyboardShouldPersistTaps="handled"
        >
          <ScreenHeader
            title="Campus Safety Incident Report"
            subtitle="Verified reporting for ragging, harassment, violence, medical & campus safety"
            onBack={true}
          />

          {/* Safety First Alert */}
          <View style={[styles.safetyAdvisory, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={{ fontSize: 20 }}>🛡️</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.safetyAdvisoryTitle, { color: c.text }]}>
                Confidential & Official Reporting Portal
              </Text>
              <Text style={[styles.safetyAdvisorySub, { color: c.sub }]}>
                Covers Anti-Ragging, Women's Harassment (POSH), Medical emergencies, theft and campus hazards. For immediate life-safety emergencies, trigger the manual SOS button instead.
              </Text>
            </View>
          </View>

          <ErrorBanner message={error} onRetry={() => setError(null)} />

          {/* ── STEP 1: Quick Finder & Master Category Selection ── */}
          <Text style={[styles.sectionHeading, { color: c.text }]}>1. Select Incident Category</Text>

          {/* Search Bar */}
          <View style={[styles.searchBox, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={{ fontSize: 16, marginRight: 8 }}>🔍</Text>
            <TextInput
              style={[styles.searchInput, { color: c.text }]}
              placeholder="Search ragging, harassment, accident, fire, theft..."
              placeholderTextColor={c.faint}
              value={searchQuery}
              onChangeText={setSearchQuery}
              clearButtonMode="while-editing"
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')} hitSlop={10}>
                <Text style={{ fontSize: 14, color: c.faint }}>✕</Text>
              </Pressable>
            )}
          </View>

          {/* Master Categories Horizontal / Grid Scroll */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.masterCatScroll}
          >
            {visibleCategories.map((cat) => {
              const isSelected = selectedMaster.id === cat.id;
              return (
                <PressableScale
                  key={cat.id}
                  onPress={() => handleSelectMaster(cat)}
                  style={[
                    styles.masterCard,
                    {
                      backgroundColor: isSelected ? c.primarySoft : c.card,
                      borderColor: isSelected ? c.primary : c.border,
                      borderWidth: isSelected ? 2 : 1,
                    },
                  ]}
                  accessibilityLabel={cat.label}
                >
                  <Text style={{ fontSize: 24, marginBottom: 4 }}>{cat.icon}</Text>
                  <Text
                    style={[
                      styles.masterCardTitle,
                      { color: isSelected ? c.primaryDark : c.text, fontWeight: isSelected ? '800' : '600' },
                    ]}
                    numberOfLines={2}
                  >
                    {cat.label}
                  </Text>
                  {cat.isConfidentialRecommended && (
                    <View style={styles.confPill}>
                      <Text style={styles.confPillText}>🔒 Confidential</Text>
                    </View>
                  )}
                </PressableScale>
              );
            })}
          </ScrollView>

          {/* Category Description Banner */}
          <View style={[styles.catDescBanner, { backgroundColor: c.cardElevated, borderColor: c.border }]}>
            <Text style={{ fontSize: 18, marginRight: 8 }}>{selectedMaster.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.catDescTitle, { color: c.text }]}>{selectedMaster.label}</Text>
              <Text style={[styles.catDescText, { color: c.sub }]}>{selectedMaster.description}</Text>
            </View>
          </View>

          {/* ── STEP 2: Subcategory Selection ── */}
          <Text style={[styles.sectionHeading, { color: c.text, marginTop: spacing.l }]}>
            2. Specific Subcategory / Case Type
          </Text>
          <Card>
            <Text style={[styles.subHint, { color: c.faint }]}>
              Tap the exact nature of the incident to configure automated risk triage:
            </Text>
            <View style={styles.subGrid}>
              {selectedMaster.subcategories.map((sub) => {
                const isSel = selectedSubcategory === sub;
                return (
                  <PressableScale
                    key={sub}
                    onPress={() => handleSelectSub(sub)}
                    style={[
                      styles.subChip,
                      {
                        backgroundColor: isSel ? c.primary : c.background,
                        borderColor: isSel ? c.primary : c.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.subChipText,
                        { color: isSel ? c.onPrimary : c.text, fontWeight: isSel ? '700' : '500' },
                      ]}
                    >
                      {isSel ? '✓ ' : ''}{sub}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>
          </Card>

          {/* ── STEP 3: Sensitive & Confidential Complaints ── */}
          <Card style={[{ marginTop: spacing.m, borderColor: isSensitive ? '#7C3AED' : c.border, borderWidth: isSensitive ? 2 : 1 }]}>
            <View style={styles.confidentialRow}>
              <View style={{ flex: 1, paddingRight: spacing.m }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 20 }}>{isSensitive ? '🛡️' : '🔒'}</Text>
                  <Text style={[styles.confidentialTitle, { color: isSensitive ? '#7C3AED' : c.text }]}>
                    Sensitive / Confidential Grievance Mode
                  </Text>
                </View>
                <Text style={[styles.confidentialSub, { color: c.sub }]}>
                  Activates independent escalation. Directly routes this grievance to the Chief Security Administrator & Anti-Ragging Directorate, completely isolated from regular campus responders.
                </Text>
              </View>
              <Switch
                value={isSensitive}
                onValueChange={(v) => {
                  Haptics.selectionAsync().catch(() => {});
                  setIsSensitive(v);
                  if (v) setIsConfidential(true);
                }}
                trackColor={{ false: c.border, true: '#7C3AED' }}
                accessibilityLabel="Toggle sensitive confidential grievance mode"
              />
            </View>

            {isSensitive && (
              <View style={{ marginTop: spacing.m, borderTopWidth: 1, borderTopColor: c.border, paddingTop: spacing.m }}>
                <Text style={[styles.label, { color: c.text, marginBottom: spacing.s }]}>
                  Sensitive Case Category
                </Text>
                <View style={styles.sensitiveGrid}>
                  {SENSITIVE_CATEGORIES.map((sc) => {
                    const active = sensitiveCategory === sc.value;
                    return (
                      <PressableScale
                        key={sc.value}
                        onPress={() => {
                          setSensitiveCategory(sc.value);
                          Haptics.selectionAsync().catch(() => {});
                        }}
                        style={[
                          styles.sensitiveChip,
                          {
                            backgroundColor: active ? '#7C3AED' : c.cardElevated,
                            borderColor: active ? '#7C3AED' : c.border,
                          },
                        ]}
                      >
                        <Text style={{ fontSize: 16 }}>{sc.icon}</Text>
                        <View style={{ flex: 1, marginLeft: 6 }}>
                          <Text
                            style={{
                              fontSize: 12.5,
                              fontWeight: active ? '700' : '500',
                              color: active ? '#FFFFFF' : c.text,
                            }}
                          >
                            {sc.label}
                          </Text>
                          <Text
                            style={{
                              fontSize: 10,
                              color: active ? '#E9D5FF' : c.faint,
                              marginTop: 2,
                            }}
                            numberOfLines={1}
                          >
                            {sc.desc}
                          </Text>
                        </View>
                      </PressableScale>
                    );
                  })}
                </View>

                {/* Optional Accused Person / Department */}
                <View style={{ marginTop: spacing.m }}>
                  <Input
                    label="Person / Staff Involved (Optional)"
                    placeholder="e.g. Dr. K. Verma / Warden Hostel 8 / Senior Student"
                    value={accusedPerson}
                    onChangeText={setAccusedPerson}
                  />
                  <Input
                    label="Department / Unit Involved (Optional)"
                    placeholder="e.g. Mechanical Dept Workshops / Hostel Security / Admin Office"
                    value={accusedDepartment}
                    onChangeText={setAccusedDepartment}
                  />
                </View>

                {/* Confidentiality Notice Box */}
                <View style={[styles.confidentialNoticeBox, { backgroundColor: '#F5F3FF', borderColor: '#8B5CF6' }]}>
                  <Text style={{ fontSize: 18, marginRight: 8 }}>⚖️</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#5B21B6', fontWeight: '800', fontSize: 13 }}>
                      Independent Review & Anti-Retaliation Notice
                    </Text>
                    <Text style={{ color: '#6D28D9', fontSize: 12, marginTop: 4, lineHeight: 17 }}>
                      Complaints involving faculty, administrative staff, reviewers, or security personnel are automatically routed through an independent escalation pathway. The accused individual and regular staff are strictly barred from receiving, reviewing, or altering this submission.
                    </Text>
                  </View>
                </View>

                {/* Acknowledgment Switch / Checkbox */}
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setConfidentialityNoticeAcknowledged(!confidentialityNoticeAcknowledged);
                  }}
                  style={styles.ackRow}
                >
                  <View
                    style={[
                      styles.ackCheckbox,
                      {
                        backgroundColor: confidentialityNoticeAcknowledged ? '#7C3AED' : 'transparent',
                        borderColor: confidentialityNoticeAcknowledged ? '#7C3AED' : c.border,
                      },
                    ]}
                  >
                    {confidentialityNoticeAcknowledged && <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '900' }}>✓</Text>}
                  </View>
                  <Text style={[styles.ackText, { color: c.text }]}>
                    I acknowledge that this case will be reviewed exclusively by authorized independent reviewers.
                  </Text>
                </Pressable>
                {fieldErrors.confidentialityNotice && (
                  <Text style={{ color: '#DC2626', fontSize: 12, marginTop: 4 }}>
                    {fieldErrors.confidentialityNotice}
                  </Text>
                )}
              </View>
            )}
          </Card>

          {/* ── STEP 4: Risk-Based Urgency Triage ── */}
          <Text style={[styles.sectionHeading, { color: c.text, marginTop: spacing.l }]}>
            3. Urgency & Severity Triage
          </Text>
          <Card>
            <View style={styles.priorityRow}>
              {PRIORITIES.map((p) => {
                const active = priority === p.value;
                return (
                  <Pressable
                    key={p.value}
                    onPress={() => setPriority(p.value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`Severity ${p.label}`}
                    style={[
                      styles.priorityChip,
                      {
                        backgroundColor: active ? c.primary : c.card,
                        borderColor: active ? c.primary : c.border,
                      },
                    ]}
                  >
                    <Text style={{ fontSize: 18, marginBottom: 2 }}>{p.icon}</Text>
                    <Text
                      style={[
                        styles.priorityText,
                        { color: active ? c.onPrimary : c.text, fontWeight: '800' },
                      ]}
                    >
                      {p.label}
                    </Text>
                    <Text
                      style={[
                        styles.priorityDesc,
                        { color: active ? c.onPrimary : c.faint },
                      ]}
                      numberOfLines={1}
                    >
                      {p.desc}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {priority === 'HIGH' && (
              <View style={[styles.highPriorityNotice, { backgroundColor: '#FEE2E2', borderColor: '#EF4444' }]}>
                <Text style={{ color: '#B91C1C', fontSize: 12, fontWeight: '700' }}>
                  ⚡ High Priority Alert: Immediate emergency dispatch protocol activated upon submission.
                </Text>
              </View>
            )}
          </Card>

          {/* ── STEP 5: Title & Detailed Description ── */}
          <Text style={[styles.sectionHeading, { color: c.text, marginTop: spacing.l }]}>
            4. Incident Description & Evidence
          </Text>
          <View>
            <Input
              label="Incident Title"
              placeholder="e.g. [Ragging: Physical beating] Senior Hostel Corridor"
              value={title}
              onChangeText={setTitle}
              error={fieldErrors.title}
            />
            <Input
              label="Comprehensive Description"
              placeholder="Describe what occurred, timing, specific room/floor, involved persons or immediate threats..."
              multiline
              numberOfLines={5}
              value={description}
              onChangeText={setDescription}
              error={fieldErrors.description}
              style={styles.description}
            />
          </View>

          {/* ── STEP 6: Location & Landmark Presets ── */}
          <Card style={{ marginTop: spacing.m }}>
            <View style={styles.locRow}>
              <View style={{ flex: 1, paddingRight: spacing.m }}>
                <Text style={[styles.locTitle, { color: c.text }]}>Attach Current GPS Coordinates</Text>
                <Text style={[styles.locHint, { color: c.sub }]}>
                  Requests foreground GPS fix to verify presence. Missing GPS or permission denial will not block your submission.
                </Text>
              </View>
              <Switch
                value={includeLocation}
                onValueChange={handleToggleLocation}
                trackColor={{ false: c.border, true: c.primary }}
                accessibilityLabel="Attach GPS location"
              />
            </View>

            {includeLocation && (
              <View style={[styles.gpsStatusBox, { backgroundColor: c.cardElevated, borderColor: c.border }]}>
                <Text style={{ fontSize: 14 }}>📍</Text>
                <View style={{ flex: 1, marginLeft: 6 }}>
                  <Text style={{ color: c.text, fontSize: 12, fontWeight: '700' }}>
                    {location.loading
                      ? 'Acquiring satellite fix…'
                      : currentGpsCoords
                      ? `GPS Active: ${currentGpsCoords.latitude.toFixed(4)}, ${currentGpsCoords.longitude.toFixed(4)} (±${Math.round(currentGpsCoords.accuracy || 10)}m)`
                      : 'GPS unavailable or permission denied. You can select landmark manually below.'}
                  </Text>
                </View>
              </View>
            )}

            {/* Discrepancy Warning Banner */}
            {discrepancy?.isMismatch && (
              <View style={[styles.mismatchBanner, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 18 }}>⚠️</Text>
                  <Text style={{ color: '#92400E', fontWeight: '800', fontSize: 13, flex: 1 }}>
                    Location Mismatch Detected (~{discrepancy.distanceMeters}m divergence)
                  </Text>
                </View>
                <Text style={{ color: '#B45309', fontSize: 12, marginTop: 4, lineHeight: 17 }}>
                  Your selected incident location differs from your current GPS location. The incident may have happened elsewhere. Please verify the incident location before continuing.
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <Button
                    title="Use Current GPS Instead"
                    small
                    variant="subtle"
                    onPress={handleUseCurrentLocation}
                  />
                  <Button
                    title={mismatchConfirmed ? '✓ Confirmed: Happened Elsewhere' : 'Confirm: Happened Elsewhere'}
                    small
                    variant={mismatchConfirmed ? 'success' : 'outline'}
                    onPress={() => setMismatchConfirmed(!mismatchConfirmed)}
                  />
                </View>
              </View>
            )}

            {/* Campus Boundary Geofence Notice */}
            {isLocationOutsideCampus && (
              <View style={[styles.offCampusBanner, { backgroundColor: '#EFF6FF', borderColor: '#3B82F6' }]}>
                <Text style={{ fontSize: 16, marginRight: 6 }}>ℹ️</Text>
                <Text style={{ color: '#1E40AF', fontSize: 12, flex: 1, lineHeight: 17 }}>
                  Selected location is outside the BIT Sindri campus perimeter. Off-campus reports are legitimate and fully accepted; they will be routed to campus police liaison.
                </Text>
              </View>
            )}

            <View style={{ marginTop: spacing.m, borderTopWidth: 1, borderTopColor: c.border, paddingTop: spacing.m }}>
              <Text style={[styles.presetLabel, { color: c.faint }]}>CAMPUS LANDMARK SELECTOR (TAP TO ATTACH)</Text>
              <View style={styles.presetGrid}>
                {CAMPUS_PRESETS.map((preset) => (
                  <PressableScale
                    key={preset}
                    onPress={() => applyLandmarkPreset(preset)}
                    style={[
                      styles.presetChip,
                      {
                        backgroundColor: campusLandmark === preset ? c.primarySoft : c.cardElevated,
                        borderColor: campusLandmark === preset ? c.primary : c.border,
                      },
                    ]}
                  >
                    <Text style={[styles.presetChipText, { color: campusLandmark === preset ? c.primaryDark : c.text }]}>
                      {preset}
                    </Text>
                  </PressableScale>
                ))}
              </View>

              <Input
                label="Campus Landmark"
                placeholder="e.g. Near Senior Hostel 8 Lawn / Dispensary Circle"
                value={campusLandmark}
                onChangeText={(t) => {
                  setCampusLandmark(t);
                  const resolved = findLandmarkCoords(t);
                  if (resolved) {
                    setSelectedCoords({ latitude: resolved.latitude, longitude: resolved.longitude });
                  }
                  setMismatchConfirmed(false);
                }}
                error={fieldErrors.campusLandmark}
                style={{ marginTop: spacing.s }}
              />
              <Input
                label="Building / Room / Wing (optional)"
                placeholder="e.g. Hostel 8, Room 214, 2nd Floor Corridor"
                value={buildingOrRoom}
                onChangeText={setBuildingOrRoom}
                error={fieldErrors.buildingOrRoom}
              />
            </View>
          </Card>

          {/* ── STEP 7: Photo Evidence Upload ── */}
          <Card style={{ marginTop: spacing.m }}>
            <Text style={[styles.label, { color: c.text }]}>Photo Evidence (Optional)</Text>
            {photo ? (
              <View>
                <Image source={{ uri: photo.uri }} style={styles.photoPreview} resizeMode="cover" />
                <View style={styles.photoActions}>
                  <Button title="Replace Photo" variant="subtle" small onPress={pickPhoto} />
                  <Button title="Remove" variant="danger" small onPress={removePhoto} />
                </View>
              </View>
            ) : (
              <Button title="📷 Attach Evidence Photo (Max 5 MB)" variant="subtle" onPress={pickPhoto} />
            )}
            <Text style={[styles.photoHint, { color: c.faint }]}>
              Supports JPEG/PNG/WebP. Stored securely and accessible only to authorized grievance responders.
            </Text>
          </Card>

          {/* Submit Button */}
          <Button
            title={uploading ? 'Uploading Evidence…' : submitting ? 'Submitting Report…' : 'Submit Safety Report'}
            onPress={submit}
            loading={busy}
            style={{ marginTop: spacing.l }}
          />

          <Text style={[styles.note, { color: c.faint }]}>
            Protected under University Safety Regulations. False or abusive submissions are strictly audited under the Student Code of Conduct.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export default function ReportScreen() {
  return (
    <AuthGate>
      <Report />
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: spacing.l, paddingBottom: spacing.xxl },
  safetyAdvisory: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderWidth: 1,
    borderRadius: radius.l,
    padding: spacing.l,
    marginBottom: spacing.m,
  },
  safetyAdvisoryTitle: { fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  safetyAdvisorySub: { fontSize: 12.5, lineHeight: 18, marginTop: 4 },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: spacing.s,
    marginTop: spacing.s,
    letterSpacing: -0.2,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.l,
    height: 48,
    borderRadius: radius.l,
    borderWidth: 1.2,
    marginBottom: spacing.m,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  masterCatScroll: {
    gap: 10,
    paddingBottom: spacing.s,
  },
  masterCard: {
    width: 148,
    padding: 14,
    borderRadius: radius.l,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    minHeight: 116,
  },
  masterCardTitle: {
    fontSize: 12.5,
    lineHeight: 16,
  },
  confPill: {
    backgroundColor: '#EFF6FF',
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 6,
  },
  confPillText: {
    fontSize: 9.5,
    color: '#2563EB',
    fontWeight: '700',
  },
  catDescBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.m,
    borderRadius: radius.m,
    borderWidth: 1,
    marginTop: spacing.s,
  },
  catDescTitle: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  catDescText: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  subHint: {
    fontSize: 12,
    marginBottom: spacing.m,
  },
  subGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  subChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  subChipText: {
    fontSize: 12.5,
  },
  confidentialRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  confidentialTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  confidentialSub: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  priorityRow: {
    flexDirection: 'row',
    gap: spacing.s,
  },
  priorityChip: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: radius.m,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priorityText: {
    fontSize: 13,
  },
  priorityDesc: {
    fontSize: 9.5,
    marginTop: 2,
    textAlign: 'center',
  },
  highPriorityNotice: {
    padding: 8,
    borderRadius: radius.s,
    borderWidth: 1,
    marginTop: spacing.s,
  },
  label: { ...type.bodyStrong, fontSize: 14, marginBottom: spacing.s },
  description: { minHeight: 120, textAlignVertical: 'top', paddingTop: spacing.m },
  photoPreview: { width: '100%', height: 200, borderRadius: radius.m, marginBottom: spacing.m },
  photoActions: { flexDirection: 'row', gap: spacing.s },
  photoHint: { fontSize: 11.5, marginTop: spacing.s, fontStyle: 'italic', lineHeight: 17 },
  locRow: { flexDirection: 'row', alignItems: 'center' },
  locTitle: { ...type.bodyStrong, fontSize: 14 },
  locHint: { fontSize: 12.5, lineHeight: 18, marginTop: 3 },
  presetLabel: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.5, marginBottom: 8 },
  presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.s },
  presetChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1 },
  presetChipText: { fontSize: 11.5, fontWeight: '600' },
  note: { textAlign: 'center', fontSize: 12, marginTop: spacing.m, lineHeight: 18 },
  sensitiveGrid: { gap: 8, marginBottom: spacing.m },
  sensitiveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: radius.m,
    borderWidth: 1,
  },
  confidentialNoticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.m,
    borderRadius: radius.m,
    borderWidth: 1,
    marginTop: spacing.m,
  },
  ackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.m,
    gap: 10,
  },
  ackCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ackText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '600',
    lineHeight: 17,
  },
  gpsStatusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: radius.m,
    borderWidth: 1,
    marginTop: spacing.s,
  },
  mismatchBanner: {
    padding: spacing.m,
    borderRadius: radius.m,
    borderWidth: 1.5,
    marginTop: spacing.m,
  },
  offCampusBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.m,
    borderRadius: radius.m,
    borderWidth: 1,
    marginTop: spacing.m,
  },
});
