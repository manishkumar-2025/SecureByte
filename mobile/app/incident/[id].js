import React, { useCallback, useState } from 'react';
import {
  Image,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { api, apiUpload, photoUrl } from '../../src/api/client';
import { getPendingIncidents } from '../../src/utils/outboxQueue';
import { storage } from '../../src/utils/storage';
import { useAuth } from '../../src/context/AuthContext';
import { AuthGate } from '../../src/components/Gate';
import ScreenHeader from '../../src/components/ScreenHeader';
import Card, { SectionTitle } from '../../src/components/Card';
import Input from '../../src/components/Input';
import Button from '../../src/components/Button';
import Timeline from '../../src/components/Timeline';
import PressableScale from '../../src/components/PressableScale';
import { StatusBadge, PriorityBadge } from '../../src/components/Badges';
import { LoadingScreen, EmptyState, ErrorBanner } from '../../src/components/Feedback';
import { useConfirm } from '../../src/components/ConfirmDialog';
import { useToast } from '../../src/components/Toast';
import { statusMeta, CATEGORY_META, radius, shadowCard, spacing, type } from '../../src/theme';
import { useTheme } from '../../src/hooks/useTheme';
import { formatDateTime, mapsUrl, shortId } from '../../src/utils/format';

const NEXT_ACTION = {
  NEW: { to: 'ACKNOWLEDGED', label: '✓ Acknowledge' },
  ACKNOWLEDGED: { to: 'IN_PROGRESS', label: '▶ Mark In Progress' },
  IN_PROGRESS: { to: 'RESOLVED', label: '✔ Mark Resolved' },
  RESOLVED: null,
};

const STATUS_STAGES = [
  { key: 'NEW', label: 'Reported', icon: '📝' },
  { key: 'ACKNOWLEDGED', label: 'Acknowledged', icon: '👁️' },
  { key: 'IN_PROGRESS', label: 'In Progress', icon: '⚙️' },
  { key: 'RESOLVED', label: 'Resolved', icon: '✅' },
];

const CATEGORY_GUIDANCE = {
  SOS_ALERT: {
    title: 'Emergency SOS Protocol',
    icon: '🚨',
    tips: [
      'Keep your phone active and stay in a visible, populated area if safe to do so.',
      'Campus Quick Response Patrol has received your coordinates and timestamp.',
      'If you can safely speak, call the Campus Security Control Room directly.',
    ],
    contact: '+913262350495',
    contactLabel: 'Call Security Control Room (24×7)',
  },
  FIRE_HAZARD: {
    title: 'Fire Safety & Evacuation Protocol',
    icon: '🔥',
    tips: [
      'Immediately evacuate the building via marked emergency stairwells.',
      'Do not use elevators or return to collect personal belongings.',
      'Primary assembly points: Deshpande Auditorium grounds & Central Sports Oval.',
      'CO₂ and ABC dry-powder fire points are located at every floor landing.',
    ],
    contact: '+913262350495',
    contactLabel: 'Call Fire Response Team',
  },
  MEDICAL_EMERGENCY: {
    title: 'Campus Medical Response Protocol',
    icon: '🏥',
    tips: [
      'BIT Dispensary on-duty doctor and campus ambulance have been notified.',
      'Keep the patient warm, calm, and resting in a comfortable position.',
      'Do not administer oral medicine without professional medical evaluation.',
      'BIT Dispensary is located near Hostel Circle (staffed 24×7).',
    ],
    contact: '+919431123456',
    contactLabel: 'Call BIT Dispensary / Ambulance',
  },
  SECURITY_THREAT: {
    title: 'Campus Security Threat Protocol',
    icon: '🛡️',
    tips: [
      'Move toward populated, well-monitored zones like the Central Library or Main Gate.',
      'Security patrol cars have increased surveillance around this campus quadrant.',
      'Note any descriptive details (clothing, direction of movement, vehicle license).',
    ],
    contact: '+913262350495',
    contactLabel: 'Call Campus Security Desk',
  },
  HARASSMENT: {
    title: 'Confidential Support & Anti-Ragging Cell',
    icon: '🤝',
    tips: [
      'CampusShield provides strictly confidential reporting. Your details are secured.',
      'The BIT Sindri Anti-Ragging and Women\'s Grievance Committee has active jurisdiction.',
      'Confidential counseling is accessible at the Student Welfare Office.',
    ],
    contact: '+9118001805522',
    contactLabel: 'Call Anti-Ragging Helpline (Toll-Free)',
  },
  FACILITY_CONCERN: {
    title: 'Campus Infrastructure Protocol',
    icon: '🔧',
    tips: [
      'Report has been routed to the Campus Estate & Electrical Maintenance Wing.',
      'Responders inspect reported hazards according to priority SLAs.',
      'Maintenance team will cordon off hazardous areas until repairs are certified.',
    ],
    contact: '+913262350495',
    contactLabel: 'Call Estate Maintenance Desk',
  },
  OTHER: {
    title: 'Campus Safety Advisory',
    icon: '📌',
    tips: [
      'Your report is logged in the central safety console for responder triage.',
      'You will receive live notification updates as responders update status.',
    ],
    contact: '+913262350495',
    contactLabel: 'Call Campus Security Desk',
  },
};

// Editable categories for picker (excludes SOS_ALERT — system-only)
const EDITABLE_CATEGORIES = [
  { key: 'FIRE_HAZARD', label: 'Fire Hazard', icon: '🔥' },
  { key: 'MEDICAL_EMERGENCY', label: 'Medical Emergency', icon: '🏥' },
  { key: 'SECURITY_THREAT', label: 'Security Threat', icon: '🛡️' },
  { key: 'HARASSMENT', label: 'Harassment / Ragging', icon: '🤝' },
  { key: 'FACILITY_CONCERN', label: 'Facility Concern', icon: '🔧' },
  { key: 'OTHER', label: 'Other', icon: '📌' },
];

function IncidentDetails() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const c = useTheme();
  const { user } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const isStaff = user?.role === 'RESPONDER' || user?.role === 'ADMIN';
  const isOwner = (incident) => incident && incident.reporterId === user?.id;

  const [incident, setIncident] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const [notes, setNotes] = useState('');
  const [actionError, setActionError] = useState(null);
  const [acting, setActing] = useState(false);
  const [photoModal, setPhotoModal] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // ── Edit mode state ──────────────────────────────────────────
  const [editMode, setEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState(null);
  const [editFieldErrors, setEditFieldErrors] = useState({});
  const [catPickerOpen, setCatPickerOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);

    // 1. Check if this is an offline queued item from outbox
    if (typeof id === 'string' && (id.startsWith('outbox_') || id.startsWith('OFFLINE-'))) {
      try {
        const pending = await getPendingIncidents();
        const found = pending.find((p) => p.id === id);
        if (found) {
          setIncident({
            id: found.id,
            title: found.payload.title || (found.payload.isSos ? '🚨 Emergency SOS' : 'Incident Report'),
            description: found.payload.description,
            category: found.payload.category || (found.payload.isSos ? 'SECURITY_THREAT' : 'OTHER'),
            priority: found.payload.priority || (found.payload.isSos ? 'CRITICAL' : 'MEDIUM'),
            status: 'PENDING_OFFLINE_SYNC',
            createdAt: found.createdAt,
            location: found.payload.location,
            isSos: !!found.payload.isSos,
            isOfflineQueued: true,
          });
          setNotFound(false);
          return;
        }
      } catch (err) {}
    }

    // 2. Fetch from backend API or fall back to cached reports
    try {
      const data = await api(`/api/incidents/${id}`);
      setIncident(data.incident);
      setNotFound(false);
    } catch (e) {
      if (e.status === 404) {
        setNotFound(true);
      } else if (e.code === 'NETWORK_ERROR' || e.status === 0 || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
        try {
          const cached = await storage.getItem('cache_my_reports');
          if (cached) {
            const list = JSON.parse(cached);
            const found = list.find((it) => it.id === id);
            if (found) {
              setIncident(found);
              setNotFound(false);
              return;
            }
          }
        } catch (cacheErr) {}
        setError('Network unavailable and report not cached locally.');
      } else {
        setError(e.message);
      }
    }
  }, [id]);

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

  const changeStatus = async (newStatus) => {
    const label = NEXT_ACTION[incident.status]?.label || newStatus;
    const ok = await confirm({
      title: `${label.replace(/^[^\w]+\s*/, '')}?`,
      message:
        newStatus === 'RESOLVED'
          ? 'This closes the incident. The reporter will be notified and no further status changes are possible.'
          : 'The reporter will be notified of this status change.',
      confirmLabel: 'Confirm',
    });
    if (!ok) return;

    setActionError(null);
    setActing(true);
    try {
      const data = await api(`/api/responder/incidents/${id}/status`, {
        method: 'PATCH',
        body: { newStatus, responderNotes: notes.trim() || undefined },
      });
      setIncident(data.incident);
      setNotes('');
      toast.success('Status updated', `Incident is now ${newStatus.replace('_', ' ').toLowerCase()}.`);
    } catch (e) {
      setActionError(e.message);
      toast.error('Update failed', e.message);
    } finally {
      setActing(false);
    }
  };

  const addPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      toast.info('Permission needed', 'Allow photo access to attach evidence.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const ext = (asset.uri.split('.').pop() || 'jpg').toLowerCase();
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

    setUploadingPhoto(true);
    try {
      const form = { uri: asset.uri, name: `evidence.${ext === 'jpeg' ? 'jpg' : ext}`, type: mime };
      const data = await apiUpload(`/api/incidents/${id}/photo`, form);
      setIncident((prev) => ({ ...(prev || {}), photoPath: data.incident.photoPath }));
      toast.success('Photo attached', 'Evidence saved to the report.');
    } catch (e) {
      toast.error('Upload failed', e.message);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const removePhoto = async () => {
    const ok = await confirm({
      title: 'Remove the photo?',
      message: 'The attached evidence will be deleted from the report.',
      confirmLabel: 'Remove photo',
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/incidents/${id}/photo`, { method: 'DELETE' });
      setIncident((prev) => ({ ...(prev || {}), photoPath: null }));
      toast.success('Photo removed');
    } catch (e) {
      toast.error('Could not remove photo', e.message);
    }
  };

  const copyRefId = () => {
    toast.success('Reference copied', `#${id.slice(0, 8).toUpperCase()} copied for campus dispatch.`);
  };

  // ── Edit helpers ─────────────────────────────────────────────
  const openEditMode = () => {
    setEditTitle(incident.title || '');
    setEditDescription(incident.description || '');
    setEditCategory(incident.category || 'OTHER');
    setEditError(null);
    setEditFieldErrors({});
    setEditMode(true);
  };

  const cancelEdit = () => {
    setEditMode(false);
    setEditError(null);
    setEditFieldErrors({});
  };

  const validateEdit = () => {
    const errs = {};
    if (!editTitle.trim() || editTitle.trim().length < 5) errs.title = 'Title must be at least 5 characters.';
    if (editTitle.trim().length > 120) errs.title = 'Title must be under 120 characters.';
    if (!editDescription.trim() || editDescription.trim().length < 10)
      errs.description = 'Description must be at least 10 characters.';
    if (editDescription.trim().length > 2000) errs.description = 'Description must be under 2000 characters.';
    setEditFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const saveEdit = async () => {
    setEditError(null);
    if (!validateEdit()) return;
    setEditSaving(true);
    try {
      const data = await api(`/api/incidents/${id}`, {
        method: 'PATCH',
        body: {
          title: editTitle.trim(),
          description: editDescription.trim(),
          category: editCategory,
        },
      });
      setIncident(data.incident);
      setEditMode(false);
      toast.success('Report updated', 'Your changes have been saved.');
    } catch (e) {
      setEditError(e.message);
    } finally {
      setEditSaving(false);
    }
  };

  if (notFound) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: c.background }]}>
        <ScreenHeader title="Incident" onBack={true} />
        <EmptyState icon="🔎" title="Incident not found" message="It may have been removed, or the link is wrong." />
      </SafeAreaView>
    );
  }

  if (!incident) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: c.background }]}>
        <ScreenHeader title="Incident" onBack={true} />
        {error ? (
          <View style={{ padding: spacing.l }}>
            <ErrorBanner message={error} onRetry={load} />
          </View>
        ) : (
          <LoadingScreen />
        )}
      </SafeAreaView>
    );
  }

  const cat = CATEGORY_META[incident.category] || { label: incident.category, icon: '📌' };
  const guidance = CATEGORY_GUIDANCE[incident.category] || CATEGORY_GUIDANCE.OTHER;
  const action = isStaff ? NEXT_ACTION[incident.status] : null;
  const meta = statusMeta(c);

  // Status progress stepper calculations
  const stageOrder = { NEW: 0, ACKNOWLEDGED: 1, IN_PROGRESS: 2, RESOLVED: 3 };
  const currentStageIndex = stageOrder[incident.status] ?? 0;

  // Can the owner edit this incident?
  const canEdit = isOwner(incident) && incident.status === 'NEW' && !incident.isSos;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.background }]}>
      <View style={{ maxWidth: 640, width: '100%', alignSelf: 'center' }}>
        <ScreenHeader
          title={incident.isSos ? '🆘 SOS Alert' : cat.label}
          subtitle={`#${id.slice(0, 8).toUpperCase()}`}
          onBack={true}
          right={
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {canEdit && !editMode && (
                <Pressable onPress={openEditMode} hitSlop={10} accessibilityLabel="Edit report">
                  <View style={[styles.copyChip, { backgroundColor: c.card, borderColor: c.border }]}>
                    <Text style={[styles.copyChipText, { color: c.sub }]}>✏️ Edit</Text>
                  </View>
                </Pressable>
              )}
              <Pressable onPress={copyRefId} hitSlop={10} accessibilityLabel="Copy reference ID">
                <View style={[styles.copyChip, { backgroundColor: c.card, borderColor: c.border }]}>
                  <Text style={[styles.copyChipText, { color: c.primary }]}>📋 Copy ID</Text>
                </View>
              </Pressable>
            </View>
          }
        />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}>
        <ErrorBanner message={error} onRetry={load} />

        {/* ── 1. Visual Status Stepper ── */}
        <Card style={styles.stepperCard}>
          <Text style={[styles.stepperHeader, { color: c.sub }]}>Lifecycle Status Tracker</Text>
          <View style={styles.stepperRow}>
            {STATUS_STAGES.map((st, idx) => {
              const isPast = idx < currentStageIndex;
              const isCurrent = idx === currentStageIndex;
              const dotColor = isCurrent ? (incident.isSos ? c.danger : c.primary) : isPast ? c.success : c.border;
              const labelColor = isCurrent ? c.text : isPast ? c.sub : c.faint;
              return (
                <View key={st.key} style={styles.stepItem}>
                  <View style={styles.stepCircleRow}>
                    {idx > 0 && (
                      <View style={[styles.stepLine, { backgroundColor: idx <= currentStageIndex ? c.success : c.border }]} />
                    )}
                    <View style={[styles.stepCircle, { backgroundColor: dotColor, borderColor: isCurrent ? c.card : 'transparent' }]}>
                      <Text style={styles.stepCircleText}>{isPast ? '✓' : st.icon}</Text>
                    </View>
                    {idx < STATUS_STAGES.length - 1 && (
                      <View style={[styles.stepLine, { backgroundColor: idx < currentStageIndex ? c.success : c.border }]} />
                    )}
                  </View>
                  <Text style={[styles.stepLabel, { color: labelColor, fontWeight: isCurrent ? '800' : '600' }]}>
                    {st.label}
                  </Text>
                </View>
              );
            })}
          </View>
        </Card>

        {/* ── 2. Primary Incident Overview (or Edit Form) ── */}
        {editMode ? (
          <Card style={[{ borderColor: c.primary, borderWidth: 1.5 }]}>
            <View style={styles.editHeader}>
              <Text style={[styles.editHeaderTitle, { color: c.primary }]}>✏️ Edit Report</Text>
              <Text style={[styles.editHeaderSub, { color: c.sub }]}>
                Edits are allowed while your report is awaiting responder acknowledgement.
              </Text>
            </View>

            <ErrorBanner message={editError} />

            {/* Title field */}
            <View style={styles.editFieldBlock}>
              <Text style={[styles.editFieldLabel, { color: c.faint }]}>INCIDENT TITLE</Text>
              <TextInput
                style={[
                  styles.editTextInput,
                  {
                    backgroundColor: c.background,
                    borderColor: editFieldErrors.title ? c.danger : c.border,
                    color: c.text,
                  },
                ]}
                value={editTitle}
                onChangeText={(v) => {
                  setEditTitle(v);
                  if (editFieldErrors.title) setEditFieldErrors((p) => ({ ...p, title: null }));
                }}
                placeholder="Brief, descriptive title"
                placeholderTextColor={c.faint}
                maxLength={120}
                autoCapitalize="sentences"
              />
              {editFieldErrors.title ? (
                <Text style={[styles.editFieldError, { color: c.danger }]}>{editFieldErrors.title}</Text>
              ) : (
                <Text style={[styles.editFieldHint, { color: c.faint }]}>{editTitle.length}/120</Text>
              )}
            </View>

            {/* Category picker */}
            <View style={styles.editFieldBlock}>
              <Text style={[styles.editFieldLabel, { color: c.faint }]}>CATEGORY</Text>
              <Pressable
                style={[styles.catPickerBtn, { backgroundColor: c.background, borderColor: c.border }]}
                onPress={() => setCatPickerOpen(true)}
                accessibilityLabel="Choose category"
              >
                <Text style={{ fontSize: 16 }}>
                  {EDITABLE_CATEGORIES.find((x) => x.key === editCategory)?.icon || '📌'}
                </Text>
                <Text style={[styles.catPickerLabel, { color: c.text }]}>
                  {EDITABLE_CATEGORIES.find((x) => x.key === editCategory)?.label || editCategory}
                </Text>
                <Text style={{ color: c.faint, fontSize: 12 }}>▼</Text>
              </Pressable>
            </View>

            {/* Description field */}
            <View style={styles.editFieldBlock}>
              <Text style={[styles.editFieldLabel, { color: c.faint }]}>DESCRIPTION</Text>
              <TextInput
                style={[
                  styles.editTextArea,
                  {
                    backgroundColor: c.background,
                    borderColor: editFieldErrors.description ? c.danger : c.border,
                    color: c.text,
                  },
                ]}
                value={editDescription}
                onChangeText={(v) => {
                  setEditDescription(v);
                  if (editFieldErrors.description) setEditFieldErrors((p) => ({ ...p, description: null }));
                }}
                placeholder="Detailed description of the incident..."
                placeholderTextColor={c.faint}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
                maxLength={2000}
                autoCapitalize="sentences"
              />
              {editFieldErrors.description ? (
                <Text style={[styles.editFieldError, { color: c.danger }]}>{editFieldErrors.description}</Text>
              ) : (
                <Text style={[styles.editFieldHint, { color: c.faint }]}>{editDescription.length}/2000</Text>
              )}
            </View>

            <View style={styles.editActions}>
              <Button
                title={editSaving ? 'Saving…' : '💾 Save Changes'}
                onPress={saveEdit}
                loading={editSaving}
                disabled={editSaving}
                style={{ flex: 1 }}
              />
              <Button
                title="Cancel"
                variant="ghost"
                onPress={cancelEdit}
                disabled={editSaving}
                style={{ flex: 1 }}
              />
            </View>
          </Card>
        ) : (
          <Card style={[incident.isSos && { borderColor: c.danger, borderWidth: 1.5 }]}>
            <Text style={[styles.title, { color: c.text }]}>{incident.title}</Text>
            <View style={styles.badgeRow}>
              <StatusBadge status={incident.status} />
              <PriorityBadge priority={incident.priority} />
              <View style={[styles.catChip, { backgroundColor: c.background }]}>
                <Text style={[styles.catText, { color: c.sub }]}>
                  {cat.icon} {cat.label}
                </Text>
              </View>
              {incident.description && incident.description.includes('[Confidential Protection: ACTIVE]') ? (
                <View style={[styles.catChip, { backgroundColor: '#EFF6FF', borderColor: '#3B82F6', borderWidth: 1 }]}>
                  <Text style={[styles.catText, { color: '#1D4ED8', fontWeight: '800' }]}>
                    🔒 Confidential
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.desc, { color: c.text }]}>{incident.description}</Text>

            {canEdit && (
              <Pressable onPress={openEditMode}>
                <View style={[styles.editHintBanner, { backgroundColor: c.primarySoft, borderColor: c.primary }]}>
                  <Text style={[styles.editHintText, { color: c.primaryDark }]}>
                    ✏️ Awaiting acknowledgement — tap to edit title, description, or category.
                  </Text>
                </View>
              </Pressable>
            )}

            <View style={[styles.infoDivider, { borderColor: c.border }]} />
            <View style={styles.metaRow}>
              <Text style={[styles.time, { color: c.faint }]}>Submitted {formatDateTime(incident.createdAt)}</Text>
              {isStaff && incident.reporter?.name ? (
                <Text style={[styles.time, { color: c.faint }]}>Reported by {incident.reporter.name} ({incident.reporter.email || 'Student'})</Text>
              ) : (
                <Text style={[styles.time, { color: c.faint }]}>Reporter ID #{shortId(incident.reporterId)}</Text>
              )}
            </View>
          </Card>
        )}

        {/* ── 3. Responding Team & Campus Dispatch ── */}
        <SectionTitle>Assigned response unit</SectionTitle>
        <Card>
          <View style={styles.dispatchRow}>
            <View style={[styles.dispatchAvatar, { backgroundColor: incident.isSos ? c.dangerSoft : c.primarySoft }]}>
              <Text style={{ fontSize: 24 }}>{incident.isSos ? '🚨' : '🛡️'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.dispatchUnitTitle, { color: c.text }]}>
                {incident.isSos ? 'Campus Rapid Action Force' : 'Campus Safety & Vigilance Desk'}
              </Text>
              <Text style={[styles.dispatchUnitSub, { color: c.sub }]}>
                Central Security Station · 24×7 Operations Control
              </Text>
              <Text style={[styles.dispatchStatus, { color: incident.status === 'RESOLVED' ? c.success : c.primary }]}>
                ● {incident.status === 'RESOLVED' ? 'Resolution recorded & verified' : 'Active monitoring & incident dispatch'}
              </Text>
            </View>
          </View>
          <View style={{ marginTop: spacing.m, flexDirection: 'row', gap: 10 }}>
            <Button
              title="📞 Call Control Desk"
              variant="outline"
              small
              style={{ flex: 1 }}
              onPress={() => Linking.openURL('tel:+913262350495').catch(() => {})}
            />
            <Button
              title="📋 Copy Ref ID"
              variant="ghost"
              small
              style={{ flex: 1 }}
              onPress={copyRefId}
            />
          </View>
        </Card>

        {/* ── 4. Photo Evidence ── */}
        <SectionTitle>Photo evidence</SectionTitle>
        <Card>
          {incident.photoPath ? (
            <View>
              <Pressable onPress={() => setPhotoModal(true)} accessibilityRole="imagebutton" accessibilityLabel="View full-size photo">
                <Image source={{ uri: photoUrl(incident.id) }} style={styles.photo} resizeMode="cover" />
              </Pressable>
              <View style={styles.photoActions}>
                <Text style={[styles.photoMeta, { color: c.faint }]}>Tap photo to enlarge full-screen.</Text>
                {isOwner(incident) ? (
                  <Button title="Remove photo" variant="danger" small onPress={removePhoto} />
                ) : null}
              </View>
            </View>
          ) : isOwner(incident) ? (
            <View>
              <Text style={[styles.photoMeta, { color: c.sub, marginBottom: spacing.m }]}>
                No photo attached. Adding photographic evidence helps security responders assess the situation faster.
              </Text>
              <Button title={uploadingPhoto ? 'Uploading…' : '📷 Attach photo evidence'} variant="subtle" onPress={addPhoto} loading={uploadingPhoto} />
            </View>
          ) : (
            <Text style={[styles.photoMeta, { color: c.sub }]}>No photo evidence was attached to this report.</Text>
          )}
        </Card>

        {/* ── 5. Location Intelligence ── */}
        <SectionTitle>Location intelligence</SectionTitle>
        <Card>
          {incident.location ? (
            <>
              {incident.location.campusLandmark ? (
                <View style={styles.locRow}>
                  <Text style={[styles.locLabel, { color: c.faint }]}>Campus landmark</Text>
                  <Text style={[styles.locValue, { color: c.text }]}>📍 {incident.location.campusLandmark}</Text>
                </View>
              ) : null}
              {incident.location.buildingOrRoom ? (
                <View style={styles.locRow}>
                  <Text style={[styles.locLabel, { color: c.faint }]}>Building / room details</Text>
                  <Text style={[styles.locValue, { color: c.text }]}>🏢 {incident.location.buildingOrRoom}</Text>
                </View>
              ) : null}
              {incident.location.latitude != null ? (
                <View style={styles.locRow}>
                  <Text style={[styles.locLabel, { color: c.faint }]}>GPS coordinates</Text>
                  <Text style={[styles.locValue, { color: c.text }]}>
                    🌐 {incident.location.latitude.toFixed(6)}, {incident.location.longitude?.toFixed(6)}
                  </Text>
                  <PressableScale
                    onPress={() => Linking.openURL(mapsUrl(incident.location.latitude, incident.location.longitude)).catch(() => {})}
                    style={[styles.mapsBtn, { backgroundColor: c.primarySoft, borderColor: c.primary }]}
                  >
                    <Text style={[styles.mapsBtnText, { color: c.primaryDark }]}>🗺️ Open in Google Maps ↗️</Text>
                  </PressableScale>
                </View>
              ) : null}
            </>
          ) : (
            <Text style={[styles.noLoc, { color: c.sub }]}>No specific location coordinates were attached.</Text>
          )}
        </Card>

        {/* ── 6. Category-Specific Safety Protocol ── */}
        <SectionTitle>Safety guidance protocol</SectionTitle>
        <Card>
          <View style={styles.guidanceHeader}>
            <Text style={{ fontSize: 20 }}>{guidance.icon}</Text>
            <Text style={[styles.guidanceTitle, { color: c.text }]}>{guidance.title}</Text>
          </View>
          {guidance.tips.map((tip, idx) => (
            <View key={idx} style={styles.tipRow}>
              <Text style={[styles.tipBullet, { color: c.primary }]}>•</Text>
              <Text style={[styles.tipText, { color: c.sub }]}>{tip}</Text>
            </View>
          ))}
          {guidance.contact ? (
            <PressableScale
              onPress={() => Linking.openURL(`tel:${guidance.contact}`).catch(() => {})}
              style={[styles.guidanceCallBtn, { backgroundColor: c.card, borderColor: c.border }]}
            >
              <Text style={[styles.guidanceCallText, { color: c.primary }]}>
                📞 {guidance.contactLabel}
              </Text>
            </PressableScale>
          ) : null}
        </Card>

        {/* ── 7. Responder Actions (Staff Only) ── */}
        {isStaff ? (
          <>
            <SectionTitle>Responder actions</SectionTitle>
            <Card>
              {action ? (
                <>
                  <Text style={[styles.actionHint, { color: c.sub }]}>
                    Current status: <Text style={{ color: meta[incident.status]?.color, fontWeight: '800' }}>{meta[incident.status]?.label}</Text>. Next step:
                  </Text>
                  <Input
                    label="Responder notes (saved with status change)"
                    placeholder="e.g. Quick response team dispatched to location"
                    value={notes}
                    onChangeText={setNotes}
                    multiline
                    style={styles.notesInput}
                    maxLength={1000}
                  />
                  {actionError ? <ErrorBanner message={actionError} /> : null}
                  <Button title={acting ? 'Updating…' : action.label} onPress={() => changeStatus(action.to)} loading={acting} disabled={acting} />
                </>
              ) : (
                <Text style={[styles.resolvedNote, { color: c.success }]}>✔ This incident is RESOLVED. All logs are sealed and archived.</Text>
              )}
            </Card>
          </>
        ) : (
          <>
            <SectionTitle>Status timeline updates</SectionTitle>
            <Card>
              <Text style={[styles.nextText, { color: c.sub }]}>
                Authorized campus responders review this report in the console. Status changes, team notes, and resolution summaries appear live in the timeline below.
              </Text>
            </Card>
          </>
        )}

        {/* ── 8. Status History Timeline ── */}
        <SectionTitle>Full status history</SectionTitle>
        <Card>
          <Timeline history={incident.statusHistory || []} />
        </Card>
      </ScrollView>

      {/* Full-screen photo viewer modal */}
      <Modal visible={photoModal} transparent animationType="fade" onRequestClose={() => setPhotoModal(false)}>
        <SafeAreaView style={[styles.modalBg, { backgroundColor: c.overlay }]}>
          <View style={styles.modalTopRow}>
            <Pressable onPress={() => setPhotoModal(false)} accessibilityRole="button" accessibilityLabel="Close photo viewer" style={styles.closeBtn}>
              <Text style={styles.closeText}>✕ Close</Text>
            </Pressable>
          </View>
          {incident.photoPath ? (
            <Image source={{ uri: photoUrl(incident.id) }} style={styles.fullPhoto} resizeMode="contain" />
          ) : null}
        </SafeAreaView>
      </Modal>

      {/* Category picker bottom sheet */}
      <Modal visible={catPickerOpen} transparent animationType="slide" onRequestClose={() => setCatPickerOpen(false)}>
        <Pressable style={styles.catModalBackdrop} onPress={() => setCatPickerOpen(false)}>
          <View style={[styles.catModalSheet, { backgroundColor: c.cardElevated }]}>
            <View style={[styles.catModalHandle, { backgroundColor: c.border }]} />
            <Text style={[styles.catModalTitle, { color: c.text }]}>Select Category</Text>
            {EDITABLE_CATEGORIES.map((cat) => (
              <Pressable
                key={cat.key}
                style={[
                  styles.catOption,
                  {
                    backgroundColor: editCategory === cat.key ? c.primarySoft : 'transparent',
                    borderColor: editCategory === cat.key ? c.primary : c.border,
                  },
                ]}
                onPress={() => {
                  setEditCategory(cat.key);
                  setCatPickerOpen(false);
                }}
                accessibilityLabel={cat.label}
              >
                <Text style={{ fontSize: 20 }}>{cat.icon}</Text>
                <Text style={[styles.catOptionLabel, { color: editCategory === cat.key ? c.primaryDark : c.text }]}>
                  {cat.label}
                </Text>
                {editCategory === cat.key && <Text style={{ color: c.primary, fontWeight: '800' }}>✓</Text>}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

export default function IncidentDetailsScreen() {
  return (
    <AuthGate>
      <IncidentDetails />
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: spacing.l, paddingBottom: spacing.xxl, maxWidth: 640, width: '100%', alignSelf: 'center' },
  copyChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1.2,
  },
  copyChipText: { fontSize: 12.5, fontWeight: '800' },
  stepperCard: { paddingVertical: spacing.l, marginBottom: spacing.m, borderRadius: radius.l },
  stepperHeader: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: spacing.m },
  stepperRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  stepItem: { flex: 1, alignItems: 'center' },
  stepCircleRow: { flexDirection: 'row', alignItems: 'center', width: '100%', justifyContent: 'center' },
  stepLine: { flex: 1, height: 2 },
  stepCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5 },
  stepCircleText: { fontSize: 14, color: '#fff', fontWeight: '800' },
  stepLabel: { fontSize: 11.5, fontWeight: '700', marginTop: 8, textAlign: 'center' },
  title: { ...type.title, fontSize: 20, lineHeight: 28, letterSpacing: -0.3 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s, marginTop: spacing.m, flexWrap: 'wrap' },
  catChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  catText: { fontSize: 13, fontWeight: '700' },
  desc: { fontSize: 15, lineHeight: 23, marginTop: spacing.m },
  editHintBanner: {
    marginTop: spacing.m,
    padding: spacing.l,
    borderRadius: radius.l,
    borderWidth: 1,
  },
  editHintText: { fontSize: 13, lineHeight: 19 },
  infoDivider: { borderTopWidth: 1, marginVertical: spacing.m },
  metaRow: { flexDirection: 'column', gap: 5 },
  time: { fontSize: 12.5 },
  dispatchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.m },
  dispatchAvatar: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  dispatchUnitTitle: { fontSize: 15.5, fontWeight: '800', letterSpacing: -0.1 },
  dispatchUnitSub: { fontSize: 13, marginTop: 2 },
  dispatchStatus: { fontSize: 12.5, fontWeight: '800', marginTop: 4 },
  photo: { width: '100%', height: 220, borderRadius: radius.l },
  photoActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.s },
  photoMeta: { fontSize: 13, flex: 1, paddingRight: spacing.s },
  locRow: { marginBottom: spacing.m },
  locLabel: { fontSize: 11.5, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  locValue: { fontSize: 15, marginTop: 4, fontWeight: '700' },
  mapsBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 1.2,
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  mapsBtnText: { fontWeight: '800', fontSize: 13 },
  noLoc: { fontSize: 14 },
  guidanceHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.s },
  guidanceTitle: { fontSize: 15.5, fontWeight: '800', letterSpacing: -0.2 },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  tipBullet: { fontSize: 16, marginRight: 8, lineHeight: 21 },
  tipText: { fontSize: 13.5, flex: 1, lineHeight: 20 },
  guidanceCallBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radius.m,
    borderWidth: 1,
    marginTop: spacing.s,
    alignItems: 'center',
  },
  guidanceCallText: { fontSize: 13.5, fontWeight: '700' },
  actionHint: { fontSize: 13.5, marginBottom: spacing.m },
  notesInput: { minHeight: 80 },
  resolvedNote: { fontSize: 14, fontWeight: '600', lineHeight: 21 },
  nextText: { fontSize: 13.5, lineHeight: 21 },
  modalBg: { flex: 1 },
  modalTopRow: { flexDirection: 'row', justifyContent: 'flex-end', padding: spacing.l },
  closeBtn: { paddingHorizontal: spacing.m, paddingVertical: spacing.s },
  closeText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  fullPhoto: { flex: 1, marginBottom: spacing.xl },
  // ── Edit mode ──────────────────────────────────────────────
  editHeader: { marginBottom: spacing.m },
  editHeaderTitle: { fontSize: 16, fontWeight: '800' },
  editHeaderSub: { fontSize: 12.5, marginTop: 4, lineHeight: 18 },
  editFieldBlock: { marginBottom: spacing.m },
  editFieldLabel: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6, marginBottom: 6 },
  editTextInput: {
    borderWidth: 1,
    borderRadius: radius.m,
    paddingHorizontal: spacing.m,
    paddingVertical: 10,
    fontSize: 14.5,
  },
  editTextArea: {
    borderWidth: 1,
    borderRadius: radius.m,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.m,
    fontSize: 14,
    minHeight: 120,
    lineHeight: 21,
  },
  editFieldError: { fontSize: 12, marginTop: 4 },
  editFieldHint: { fontSize: 11, marginTop: 4, textAlign: 'right' },
  catPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingHorizontal: spacing.m,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: radius.m,
  },
  catPickerLabel: { flex: 1, fontSize: 14.5 },
  editActions: { flexDirection: 'row', gap: spacing.s, marginTop: spacing.m },
  // ── Category picker modal ──────────────────────────────────
  catModalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  catModalSheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.l,
    paddingBottom: spacing.xxl,
  },
  catModalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.m,
  },
  catModalTitle: { fontSize: 16, fontWeight: '800', marginBottom: spacing.m },
  catOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    paddingVertical: spacing.m,
    paddingHorizontal: spacing.m,
    borderRadius: radius.m,
    borderWidth: 1,
    marginBottom: spacing.s,
  },
  catOptionLabel: { flex: 1, fontSize: 14.5, fontWeight: '600' },
});