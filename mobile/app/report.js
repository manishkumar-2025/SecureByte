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
import { radius, spacing, type } from '../src/theme';
import { useTheme } from '../src/hooks/useTheme';

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

  // Status & Validation
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  // Filtered categories based on search
  const visibleCategories = useMemo(() => {
    return searchIncidentCategories(searchQuery);
  }, [searchQuery]);

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

  const validate = () => {
    const errs = {};
    if (title.trim().length < 5) errs.title = 'Title must be at least 5 characters.';
    if (description.trim().length < 10)
      errs.description = 'Describe the incident clearly (at least 10 characters).';
    if (campusLandmark.trim().length > 0 && campusLandmark.trim().length < 3) {
      errs.campusLandmark = 'Campus landmark must be at least 3 characters.';
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
    Haptics.selectionAsync().catch(() => {});
  };

  const submit = async () => {
    setError(null);
    if (!validate()) return;
    setSubmitting(true);

    let incidentPayload = null;
    try {
      const locPayload = {};
      if (includeLocation) {
        const locResult = await location.request();
        const locStatus = typeof locResult === 'string' ? locResult : locResult?.status;
        const locCoords = locResult?.coords || location.coords;
        if (locStatus === 'granted' && locCoords) {
          locPayload.latitude = locCoords.latitude;
          locPayload.longitude = locCoords.longitude;
        }
      }
      if (campusLandmark.trim().length >= 3) {
        locPayload.campusLandmark = campusLandmark.trim();
      }
      if (buildingOrRoom.trim().length >= 2) {
        locPayload.buildingOrRoom = buildingOrRoom.trim();
      }

      const hasLocation = Object.keys(locPayload).length > 0;

      // Construct rich, audit-compliant description containing subcategory and confidentiality flag
      const structuredHeader = [
        `[Category: ${selectedMaster.label}]`,
        `[Subcategory: ${selectedSubcategory}]`,
        isConfidential ? '[Confidential Protection: ACTIVE]' : null,
      ]
        .filter(Boolean)
        .join(' ');

      const fullDescription = `${structuredHeader}\n\n${description.trim()}`;

      incidentPayload = {
        title: title.trim(),
        description: fullDescription,
        category: selectedMaster.backendCategory,
        priority,
        isSos: false,
        ...(hasLocation ? { location: locPayload } : {}),
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

      toast.success('Incident Report Submitted ✅', 'Routed to campus safety responders & grievance committees.');
      router.replace('/my-reports');
    } catch (e) {
      if (incidentPayload && (e.code === 'NETWORK_ERROR' || e.status === 0 || (typeof navigator !== 'undefined' && navigator.onLine === false))) {
        await enqueueIncident(incidentPayload);
        toast.info('Saved to Offline Outbox 💾', 'No network detected. Your report is saved locally and will automatically sync once connected.');
        router.replace('/my-reports');
        return;
      }

      setError(e.message);
      if (e.details) setFieldErrors(e.details);
      toast.error('Could not submit', e.message);
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

          {/* ── STEP 3: Confidentiality & Protection Controls ── */}
          {selectedMaster.isConfidentialRecommended && (
            <Card style={[{ marginTop: spacing.m, borderColor: '#3B82F6', borderWidth: 1.5 }]}>
              <View style={styles.confidentialRow}>
                <View style={{ flex: 1, paddingRight: spacing.m }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 18 }}>🔒</Text>
                    <Text style={[styles.confidentialTitle, { color: c.text }]}>
                      Confidential Reporting Mode
                    </Text>
                  </View>
                  <Text style={[styles.confidentialSub, { color: c.sub }]}>
                    Restricts reporter details strictly to the Anti-Ragging Committee / Grievance Cell. Protects you from retaliation.
                  </Text>
                </View>
                <Switch
                  value={isConfidential}
                  onValueChange={setIsConfidential}
                  trackColor={{ false: c.border, true: '#2563EB' }}
                  accessibilityLabel="Toggle confidential complaint protection"
                />
              </View>
            </Card>
          )}

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
                <Text style={[styles.locTitle, { color: c.text }]}>Attach GPS Coordinates</Text>
                <Text style={[styles.locHint, { color: c.sub }]}>
                  Automatically attaches precise geo-location for dispatch responders.
                </Text>
              </View>
              <Switch
                value={includeLocation}
                onValueChange={(v) => {
                  Haptics.selectionAsync().catch(() => {});
                  setIncludeLocation(v);
                }}
                trackColor={{ false: c.border, true: c.primary }}
                accessibilityLabel="Attach GPS location"
              />
            </View>

            <View style={{ marginTop: spacing.m, borderTopWidth: 1, borderTopColor: c.border, paddingTop: spacing.m }}>
              <Text style={[styles.presetLabel, { color: c.faint }]}>POPULAR CAMPUS LANDMARKS (TAP TO FILL)</Text>
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
                onChangeText={setCampusLandmark}
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
    padding: spacing.m,
    marginBottom: spacing.m,
  },
  safetyAdvisoryTitle: { fontSize: 14.5, fontWeight: '800' },
  safetyAdvisorySub: { fontSize: 12.5, lineHeight: 18, marginTop: 3 },
  sectionHeading: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: spacing.s,
    letterSpacing: 0.2,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.m,
    height: 44,
    borderRadius: radius.m,
    borderWidth: 1,
    marginBottom: spacing.m,
  },
  searchInput: {
    flex: 1,
    fontSize: 13.5,
    paddingVertical: 0,
  },
  masterCatScroll: {
    gap: 10,
    paddingBottom: spacing.s,
  },
  masterCard: {
    width: 140,
    padding: 12,
    borderRadius: radius.m,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    minHeight: 110,
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
});
