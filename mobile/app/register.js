import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import Input from '../src/components/Input';
import Button from '../src/components/Button';
import { ErrorBanner } from '../src/components/Feedback';
import ScreenHeader from '../src/components/ScreenHeader';
import { radius, spacing, type } from '../src/theme';
import { useTheme } from '../src/hooks/useTheme';
import { useToast } from '../src/components/Toast';

/**
 * Password strength meter (visual feedback, not a security control):
 *   0-1 rules → Weak, 2 → Fair, 3 → Good, 4 → Strong.
 */
function passwordStrength(pw) {
  if (!pw) return 0;
  const rules = [pw.length >= 8, /[A-Z]/.test(pw) || /[^A-Za-z0-9]/.test(pw), /\d/.test(pw), pw.length >= 12];
  return rules.filter(Boolean).length;
}

const STRENGTH_LABELS = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'];

const ACCOUNT_TYPES = [
  { id: 'STUDENT', label: 'Student', icon: '🎓', sub: 'UG / PG Scholars (Boys & Girls)' },
  { id: 'FACULTY', label: 'Faculty / Professor', icon: '👨‍🏫', sub: 'Assistant / Associate / Prof / HOD' },
  { id: 'WARDEN', label: 'Hostel Warden', icon: '🏢', sub: 'Hostel In-charge & Supervisors' },
  { id: 'SECURITY', label: 'Campus Security', icon: '🛡️', sub: 'Patrol Guards & Emergency Response' },
  { id: 'STAFF', label: 'College Staff', icon: '💼', sub: 'Lab, Workshop, Library & Admin' },
];

export default function Register() {
  const { register } = useAuth();
  const c = useTheme();
  const toast = useToast();
  const router = useRouter();

  const [requestedRole, setRequestedRole] = useState('STUDENT');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const strength = useMemo(() => passwordStrength(password), [password]);

  const validate = () => {
    const errs = {};
    if (name.trim().length < 2) errs.name = 'Enter your full name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = 'Enter a valid email address.';
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      errs.password = 'At least 8 characters with a letter and a number.';
    }
    if (confirm !== password) errs.confirm = 'Passwords do not match.';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const submit = async () => {
    setError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      await register(name.trim(), email.trim().toLowerCase(), password, phone.trim() || null, requestedRole);
      toast.success('Account Created', 'Complete your verification to activate role privileges.');
      router.replace('/verification');
    } catch (e) {
      setError(e.message);
      if (e.details) setFieldErrors(e.details);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'android' ? undefined : 'padding'} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { maxWidth: 500, width: '100%', alignSelf: 'center' }]}
          keyboardShouldPersistTaps="handled"
        >
          <ScreenHeader title="Create campus account" subtitle="SecureByte — Campus-wide Safety Network" onBack={true} fallbackRoute="/login" />

          <ErrorBanner message={error} />

          {/* Account Type Selector */}
          <Text style={[styles.sectionLabel, { color: c.text }]}>Select Account Type</Text>
          <View style={styles.roleGrid}>
            {ACCOUNT_TYPES.map((t) => {
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

          <Input
            label="Full Name"
            placeholder="e.g. Dr. Rajesh Kumar / Ayush"
            value={name}
            onChangeText={setName}
            error={fieldErrors.name}
            autoCapitalize="words"
          />
          <Input
            label="College / Official Email"
            placeholder="name@securebyte.dev"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            error={fieldErrors.email}
          />
          <Input
            label="Mobile Number (Optional)"
            placeholder="+91 98765 43210"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />
          <Input
            label="Password"
            placeholder="At least 8 characters with letter & number"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            error={fieldErrors.password}
          />

          {/* Live password strength meter */}
          {password ? (
            <View style={styles.strengthRow}>
              <View style={[styles.strengthTrack, { backgroundColor: c.border }]}>
                <View
                  style={{
                    width: `${(strength / 4) * 100}%`,
                    height: '100%',
                    borderRadius: 3,
                    backgroundColor:
                      strength <= 1 ? c.danger : strength === 2 ? c.warning : strength === 3 ? c.info : c.success,
                  }}
                />
              </View>
              <Text style={[styles.strengthLabel, { color: c.sub }]}>{STRENGTH_LABELS[strength]}</Text>
            </View>
          ) : null}

          <Input
            label="Confirm Password"
            placeholder="Repeat your password"
            secureTextEntry
            value={confirm}
            onChangeText={setConfirm}
            error={fieldErrors.confirm}
          />

          <Button
            title={submitting ? 'Registering credentials…' : `Register as ${ACCOUNT_TYPES.find((t) => t.id === requestedRole)?.label}`}
            onPress={submit}
            loading={submitting}
            style={{ marginTop: spacing.s }}
          />

          <View style={styles.loginRow}>
            <Text style={[styles.loginText, { color: c.sub }]}>Already have an account? </Text>
            <Pressable onPress={() => router.replace('/login')} accessibilityRole="link">
              <Text style={[styles.loginLink, { color: c.primary }]}>Sign in</Text>
            </Pressable>
          </View>

          <View style={[styles.noteCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[styles.noteTitle, { color: c.text }]}>🔒 Institutional Verification Policy</Text>
            <Text style={[styles.noteLine, { color: c.sub }]}>
              After creating your account, submit your student/employee credentials for quick administrative approval. Privileged roles (College Admin & Sensitive Case Officer) are strictly assigned by authority.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxl },
  strengthRow: { flexDirection: 'row', alignItems: 'center', marginTop: -4, marginBottom: spacing.m },
  strengthTrack: { flex: 1, height: 6, borderRadius: 3, marginRight: spacing.s, overflow: 'hidden' },
  strengthLabel: { fontSize: 12, fontWeight: '700', minWidth: 68, textAlign: 'right' },
  loginRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: spacing.xl },
  loginText: { fontSize: 14.5 },
  loginLink: { fontWeight: '800', fontSize: 14.5 },
  noteCard: {
    marginTop: spacing.xl,
    borderRadius: radius.l,
    borderWidth: 1,
    padding: spacing.l,
  },
  noteTitle: { fontWeight: '800', fontSize: 13.5, marginBottom: 6, letterSpacing: -0.1 },
  noteLine: { fontSize: 13, lineHeight: 19 },
  sectionLabel: { fontSize: 13.5, fontWeight: '700', marginBottom: spacing.xs, textTransform: 'uppercase', letterSpacing: 0.5 },
  roleGrid: { gap: 8, marginBottom: spacing.m },
  roleCard: {
    borderRadius: radius.m,
    borderWidth: 1.5,
    padding: spacing.m,
  },
  roleHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  roleIcon: { fontSize: 16, marginRight: 8 },
  roleTitle: { fontSize: 14.5, fontWeight: '800' },
  roleSub: { fontSize: 12, marginLeft: 24 },
});
