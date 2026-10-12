import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { api } from '../src/api/client';
import ScreenHeader from '../src/components/ScreenHeader';
import Card, { SectionTitle } from '../src/components/Card';
import Button from '../src/components/Button';
import Input from '../src/components/Input';
import { RoleBadge, VerificationBadge } from '../src/components/Badges';
import { ErrorBanner } from '../src/components/Feedback';
import { useToast } from '../src/components/Toast';
import { radius, spacing, type } from '../src/theme';
import { useTheme } from '../src/hooks/useTheme';

const ROLE_OPTIONS = [
  { id: 'STUDENT', label: 'Student', icon: '🎓', sub: 'UG / PG Scholars (Boys & Girls)' },
  { id: 'FACULTY', label: 'Faculty / Professor', icon: '👨‍🏫', sub: 'Teaching & Department Staff' },
  { id: 'WARDEN', label: 'Hostel Warden', icon: '🏢', sub: 'Hostel In-charge & Supervisors' },
  { id: 'SECURITY', label: 'Campus Security', icon: '🛡️', sub: 'Quick Reaction Team & Patrol' },
  { id: 'STAFF', label: 'College Staff', icon: '💼', sub: 'Laboratories, Library, Admin' },
];

const GENDER_OPTIONS = ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'];
const RESIDENCY_OPTIONS = [
  { id: 'HOSTEL', label: 'Hosteller (Resident Student)' },
  { id: 'DAY_SCHOLAR', label: 'Day Scholar (Commuter)' },
];
const SHIFT_OPTIONS = ['MORNING', 'EVENING', 'NIGHT'];

export default function Verification() {
  const { user, refreshProfile } = useAuth();
  const c = useTheme();
  const toast = useToast();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Common Details
  const [fullName, setFullName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [gender, setGender] = useState(user?.gender || 'PREFER_NOT_TO_SAY');

  // Role Selection
  const [requestedRole, setRequestedRole] = useState(user?.requestedRole || user?.role || 'STUDENT');

  // Role-Specific Fields
  const [studentId, setStudentId] = useState(user?.studentId || '');
  const [enrollmentNo, setEnrollmentNo] = useState(user?.enrollmentNo || '');
  const [department, setDepartment] = useState(user?.department || '');
  const [designation, setDesignation] = useState(user?.designation || '');
  const [course, setCourse] = useState(user?.course || '');
  const [yearOrSemester, setYearOrSemester] = useState(user?.yearOrSemester || '');
  const [residencyType, setResidencyType] = useState(user?.residencyType || 'HOSTEL');
  const [hostelName, setHostelName] = useState(user?.hostelName || '');
  const [roomOrOffice, setRoomOrOffice] = useState(user?.roomOrOffice || '');
  const [guardBadgeId, setGuardBadgeId] = useState(user?.guardBadgeId || '');
  const [assignedZone, setAssignedZone] = useState(user?.assignedZone || '');
  const [shift, setShift] = useState(user?.shift || 'MORNING');

  // Emergency Guardian Contact
  const [guardianName, setGuardianName] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [guardianRelation, setGuardianRelation] = useState('Parent / Guardian');

  const currentStatus = (user?.verificationStatus || (user?.isVerified ? 'APPROVED' : 'UNVERIFIED')).toUpperCase();

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const data = await api('/api/auth/verification');
      if (data) {
        if (data.name) setFullName(data.name);
        if (data.phone) setPhone(data.phone);
        if (data.gender) setGender(data.gender);
        if (data.requestedRole) setRequestedRole(data.requestedRole);
        if (data.studentId) setStudentId(data.studentId);
        if (data.enrollmentNo) setEnrollmentNo(data.enrollmentNo);
        if (data.department) setDepartment(data.department);
        if (data.designation) setDesignation(data.designation);
        if (data.course) setCourse(data.course);
        if (data.yearOrSemester) setYearOrSemester(data.yearOrSemester);
        if (data.residencyType) setResidencyType(data.residencyType);
        if (data.hostelName) setHostelName(data.hostelName);
        if (data.roomOrOffice) setRoomOrOffice(data.roomOrOffice);
        if (data.guardBadgeId) setGuardBadgeId(data.guardBadgeId);
        if (data.assignedZone) setAssignedZone(data.assignedZone);
        if (data.shift) setShift(data.shift);
      }
    } catch (e) {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleSubmit = async () => {
    setError(null);
    if (!studentId.trim()) {
      setError(`Please provide your ${requestedRole === 'STUDENT' ? 'Student Roll / ID Number' : 'Employee / Officer ID'}.`);
      return;
    }
    if (!department.trim()) {
      setError('Please provide your department or section name.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        fullName: fullName.trim() || undefined,
        phone: phone.trim() || undefined,
        gender,
        requestedRole,
        studentId: studentId.trim(),
        enrollmentNo: enrollmentNo.trim() || undefined,
        department: department.trim(),
        designation: designation.trim() || undefined,
        course: course.trim() || undefined,
        yearOrSemester: yearOrSemester.trim() || undefined,
        residencyType: requestedRole === 'STUDENT' ? residencyType : undefined,
        hostelName: (requestedRole === 'STUDENT' && residencyType === 'HOSTEL') || requestedRole === 'WARDEN' ? hostelName.trim() : undefined,
        roomOrOffice: roomOrOffice.trim() || undefined,
        guardBadgeId: requestedRole === 'SECURITY' ? guardBadgeId.trim() : undefined,
        assignedZone: requestedRole === 'SECURITY' ? assignedZone.trim() : undefined,
        shift: requestedRole === 'SECURITY' ? shift : undefined,
        emergencyContact: guardianName.trim() && guardianPhone.trim() ? {
          name: guardianName.trim(),
          phone: guardianPhone.trim(),
          relation: guardianRelation.trim(),
        } : undefined,
      };

      await api('/api/auth/verification', { method: 'POST', body: payload });
      toast.success('Verification Submitted', 'College administration has received your credentials.');
      await refreshProfile();
      fetchStatus();
    } catch (e) {
      setError(e.message || 'Failed to submit verification details.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'android' ? undefined : 'padding'} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { maxWidth: 540, width: '100%', alignSelf: 'center' }]}
          keyboardShouldPersistTaps="handled"
        >
          <ScreenHeader
            title="College Verification"
            subtitle="Campus Identity & Role Permissions"
            onBack={true}
            fallbackRoute="/home"
          />

          {/* Current Status Overview */}
          <Card style={[styles.statusCard, { borderColor: c.border }]}>
            <View style={styles.statusHeaderRow}>
              <View>
                <Text style={[styles.statusTitle, { color: c.text }]}>Identity Status</Text>
                <Text style={[styles.statusSub, { color: c.sub }]}>
                  {user?.email} • {user?.name}
                </Text>
              </View>
              <VerificationBadge status={currentStatus} />
            </View>

            {currentStatus === 'APPROVED' ? (
              <View style={[styles.statusDetailBox, { backgroundColor: '#DCFCE7', borderColor: '#BBF7D0' }]}>
                <Text style={styles.statusDetailText}>
                  ✓ Verified as <Text style={{ fontWeight: '800' }}>{user?.role}</Text> ({user?.designation || 'Academic Member'}) in {user?.department || 'Campus Department'}.
                </Text>
                {user?.studentId ? (
                  <Text style={[styles.statusDetailSub, { color: '#14532D' }]}>
                    Campus ID: {user?.studentId} {user?.hostelName ? `• ${user?.hostelName}` : ''}
                  </Text>
                ) : null}
              </View>
            ) : currentStatus === 'PENDING' ? (
              <View style={[styles.statusDetailBox, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}>
                <Text style={[styles.statusDetailText, { color: '#78350F' }]}>
                  ⏳ Pending review by College Administration for role: <Text style={{ fontWeight: '800' }}>{requestedRole}</Text>.
                </Text>
                <Text style={[styles.statusDetailSub, { color: '#92400E' }]}>
                  Your submitted details are queued for verification. All life-safety emergency SOS capabilities remain active.
                </Text>
              </View>
            ) : currentStatus === 'RESUBMIT_REQUIRED' ? (
              <View style={[styles.statusDetailBox, { backgroundColor: '#FFEDD5', borderColor: '#FED7AA' }]}>
                <Text style={[styles.statusDetailText, { color: '#9A3412' }]}>
                  ⚠️ Reviewer Note: {user?.rejectionReason || 'Please resubmit with valid details.'}
                </Text>
              </View>
            ) : currentStatus === 'REJECTED' ? (
              <View style={[styles.statusDetailBox, { backgroundColor: '#FEE2E2', borderColor: '#FECACA' }]}>
                <Text style={[styles.statusDetailText, { color: '#991B1B' }]}>
                  ✕ Rejected: {user?.rejectionReason || 'Verification request was declined.'}
                </Text>
              </View>
            ) : (
              <View style={[styles.statusDetailBox, { backgroundColor: c.surfaceAlt || '#F1F5F9', borderColor: c.border }]}>
                <Text style={[styles.statusDetailText, { color: c.text }]}>
                  Please complete the verification form below to activate role-based safety features and staff tools.
                </Text>
              </View>
            )}

            {/* Life Safety Assurance Banner */}
            <View style={styles.sosAssuranceStrip}>
              <Text style={styles.sosAssuranceIcon}>🛡️</Text>
              <Text style={[styles.sosAssuranceText, { color: c.sub }]}>
                Emergency SOS & GPS alerts are <Text style={{ fontWeight: '700', color: c.text }}>never blocked</Text> by pending verification.
              </Text>
            </View>
          </Card>

          <ErrorBanner message={error} />

          {/* Section 1: Common Personal Details */}
          <SectionTitle title="1. Personal Details" />
          <Card style={{ marginBottom: spacing.l }}>
            <Input
              label="Full Name"
              placeholder="e.g. Ayush Kumar"
              value={fullName}
              onChangeText={setFullName}
            />
            <Input
              label="Phone Number"
              placeholder="+91 98765 43210"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />
            <Text style={[styles.fieldLabel, { color: c.text }]}>Gender (Optional)</Text>
            <View style={styles.chipsRow}>
              {GENDER_OPTIONS.map((g) => {
                const active = gender === g;
                const label = g === 'PREFER_NOT_TO_SAY' ? 'Prefer not to say' : g.charAt(0) + g.slice(1).toLowerCase();
                return (
                  <Pressable
                    key={g}
                    onPress={() => setGender(g)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: active ? c.primary : c.card,
                        borderColor: active ? c.primary : c.border,
                      },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: active ? '#FFFFFF' : c.text }]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>

          {/* Section 2: Account Role & Credentials */}
          <SectionTitle title="2. College Credentials" />
          <Card style={{ marginBottom: spacing.l }}>
            <Text style={[styles.fieldLabel, { color: c.text }]}>Account Type / Role</Text>
            <View style={styles.roleGrid}>
              {ROLE_OPTIONS.map((t) => {
                const active = requestedRole === t.id;
                return (
                  <Pressable
                    key={t.id}
                    onPress={() => setRequestedRole(t.id)}
                    style={[
                      styles.roleCard,
                      {
                        backgroundColor: active ? (c.isDark ? '#1E293B' : '#EFF6FF') : c.card,
                        borderColor: active ? c.primary : c.border,
                      },
                    ]}
                  >
                    <View style={styles.roleHeader}>
                      <Text style={styles.roleIcon}>{t.icon}</Text>
                      <Text style={[styles.roleTitle, { color: active ? c.primary : c.text }]}>{t.label}</Text>
                    </View>
                    <Text style={[styles.roleSub, { color: c.sub }]}>{t.sub}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Dynamic fields based on role */}
            {requestedRole === 'STUDENT' ? (
              <>
                <Input
                  label="Student ID / Roll Number *"
                  placeholder="e.g. 2105128"
                  value={studentId}
                  onChangeText={setStudentId}
                />
                <Input
                  label="Enrollment / Registration Number"
                  placeholder="e.g. 21/CSE/042"
                  value={enrollmentNo}
                  onChangeText={setEnrollmentNo}
                />
                <Input
                  label="Course / Degree *"
                  placeholder="e.g. B.Tech / M.Tech / PhD / MCA"
                  value={course}
                  onChangeText={setCourse}
                />
                <Input
                  label="Branch & Department *"
                  placeholder="e.g. Computer Science & Engineering"
                  value={department}
                  onChangeText={setDepartment}
                />
                <Input
                  label="Year / Semester"
                  placeholder="e.g. 3rd Year / 6th Semester"
                  value={yearOrSemester}
                  onChangeText={setYearOrSemester}
                />

                <Text style={[styles.fieldLabel, { color: c.text }]}>Residency Status</Text>
                <View style={styles.chipsRow}>
                  {RESIDENCY_OPTIONS.map((r) => {
                    const active = residencyType === r.id;
                    return (
                      <Pressable
                        key={r.id}
                        onPress={() => setResidencyType(r.id)}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: active ? c.primary : c.card,
                            borderColor: active ? c.primary : c.border,
                          },
                        ]}
                      >
                        <Text style={[styles.chipText, { color: active ? '#FFFFFF' : c.text }]}>{r.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                {residencyType === 'HOSTEL' ? (
                  <Input
                    label="Assigned Hostel & Room"
                    placeholder="e.g. Aryabhatta Hostel, Room 204"
                    value={hostelName}
                    onChangeText={setHostelName}
                  />
                ) : null}
              </>
            ) : requestedRole === 'FACULTY' ? (
              <>
                <Input
                  label="Employee ID *"
                  placeholder="e.g. EMP-FAC-401"
                  value={studentId}
                  onChangeText={setStudentId}
                />
                <Input
                  label="Department *"
                  placeholder="e.g. Computer Science & Engineering"
                  value={department}
                  onChangeText={setDepartment}
                />
                <Input
                  label="Designation *"
                  placeholder="e.g. Assistant Professor / Associate Professor / HOD"
                  value={designation}
                  onChangeText={setDesignation}
                />
                <Input
                  label="Office / Chamber Location"
                  placeholder="e.g. Academic Block B, Room 302"
                  value={roomOrOffice}
                  onChangeText={setRoomOrOffice}
                />
              </>
            ) : requestedRole === 'WARDEN' ? (
              <>
                <Input
                  label="Employee ID *"
                  placeholder="e.g. EMP-WRD-102"
                  value={studentId}
                  onChangeText={setStudentId}
                />
                <Input
                  label="Assigned Hostel *"
                  placeholder="e.g. Aryabhatta Hostel / Gargi Girls Hostel"
                  value={hostelName}
                  onChangeText={setHostelName}
                />
                <Input
                  label="Department / Section"
                  placeholder="e.g. Hostel Administration"
                  value={department}
                  onChangeText={setDepartment}
                />
                <Input
                  label="Warden Office Location & Ext"
                  placeholder="e.g. Hostel 1 Ground Floor, Ext 204"
                  value={roomOrOffice}
                  onChangeText={setRoomOrOffice}
                />
              </>
            ) : requestedRole === 'SECURITY' ? (
              <>
                <Input
                  label="Security Guard / Badge ID *"
                  placeholder="e.g. SEC-GRD-08"
                  value={studentId}
                  onChangeText={setStudentId}
                />
                <Input
                  label="Assigned Zone / Gate *"
                  placeholder="e.g. Main Gate / Hostel Circle / Patrol QRT"
                  value={assignedZone}
                  onChangeText={setAssignedZone}
                />
                <Text style={[styles.fieldLabel, { color: c.text }]}>Duty Shift</Text>
                <View style={styles.chipsRow}>
                  {SHIFT_OPTIONS.map((s) => {
                    const active = shift === s;
                    return (
                      <Pressable
                        key={s}
                        onPress={() => setShift(s)}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: active ? c.primary : c.card,
                            borderColor: active ? c.primary : c.border,
                          },
                        ]}
                      >
                        <Text style={[styles.chipText, { color: active ? '#FFFFFF' : c.text }]}>{s}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Input
                  label="Security Unit / Department"
                  placeholder="e.g. Campus Safety & Security Force"
                  value={department}
                  onChangeText={setDepartment}
                />
              </>
            ) : (
              <>
                <Input
                  label="Employee ID *"
                  placeholder="e.g. EMP-STF-305"
                  value={studentId}
                  onChangeText={setStudentId}
                />
                <Input
                  label="Department / Section *"
                  placeholder="e.g. Central Library / Maintenance / Workshop"
                  value={department}
                  onChangeText={setDepartment}
                />
                <Input
                  label="Designation"
                  placeholder="e.g. Senior Technical Assistant / Lab In-charge"
                  value={designation}
                  onChangeText={setDesignation}
                />
              </>
            )}
          </Card>

          {/* Section 3: Emergency Guardian Contact (Optional) */}
          <SectionTitle title="3. Emergency Guardian Contact" />
          <Card style={{ marginBottom: spacing.xl }}>
            <Text style={[styles.noteLine, { color: c.sub, marginBottom: spacing.m }]}>
              Optional trusted family or campus contact automatically notified during personal SOS alerts.
            </Text>
            <Input
              label="Contact Full Name"
              placeholder="e.g. Parent / Guardian Name"
              value={guardianName}
              onChangeText={setGuardianName}
            />
            <Input
              label="Contact Phone"
              placeholder="+91 98765 43210"
              keyboardType="phone-pad"
              value={guardianPhone}
              onChangeText={setGuardianPhone}
            />
            <Input
              label="Relation"
              placeholder="e.g. Mother / Father / Local Guardian"
              value={guardianRelation}
              onChangeText={setGuardianRelation}
            />
          </Card>

          <Button
            title={submitting ? 'Submitting Verification…' : 'Submit Credentials for Approval'}
            onPress={handleSubmit}
            loading={submitting}
            style={{ marginBottom: spacing.xxl }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxl },
  statusCard: { padding: spacing.l, marginBottom: spacing.l },
  statusHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.m },
  statusTitle: { fontSize: 16, fontWeight: '800' },
  statusSub: { fontSize: 13, marginTop: 2 },
  statusDetailBox: {
    padding: spacing.m,
    borderRadius: radius.m,
    borderWidth: 1,
    marginBottom: spacing.m,
  },
  statusDetailText: { fontSize: 13.5, fontWeight: '600', lineHeight: 20 },
  statusDetailSub: { fontSize: 12.5, marginTop: 4 },
  sosAssuranceStrip: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  sosAssuranceIcon: { fontSize: 16 },
  sosAssuranceText: { fontSize: 12.5, flex: 1, lineHeight: 18 },
  fieldLabel: { fontSize: 13, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.l },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  chipText: { fontSize: 13, fontWeight: '700' },
  roleGrid: { gap: 8, marginBottom: spacing.l },
  roleCard: {
    borderRadius: radius.m,
    borderWidth: 1.5,
    padding: spacing.m,
  },
  roleHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  roleIcon: { fontSize: 16, marginRight: 8 },
  roleTitle: { fontSize: 14.5, fontWeight: '800' },
  roleSub: { fontSize: 12, marginLeft: 24 },
  noteLine: { fontSize: 13, lineHeight: 19 },
});
