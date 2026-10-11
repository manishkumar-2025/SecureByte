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

export default function Register() {
  const { register } = useAuth();
  const c = useTheme();
  const toast = useToast();
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
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
      await register(name.trim(), email.trim().toLowerCase(), password);
      toast.success('Welcome to CampusShield', 'Your student account is active.');
      router.replace('/home');
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
          contentContainerStyle={[styles.scroll, { maxWidth: 480, width: '100%', alignSelf: 'center' }]}
          keyboardShouldPersistTaps="handled"
        >
          <ScreenHeader title="Create student account" subtitle="BIT Sindri Campus Safety Network" onBack={true} fallbackRoute="/login" />

          <ErrorBanner message={error} />

          <Input
            label="Full Name"
            placeholder="e.g. Ayush Kumar"
            value={name}
            onChangeText={setName}
            error={fieldErrors.name}
            autoCapitalize="words"
          />
          <Input
            label="College Email"
            placeholder="you@securebyte.dev"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            error={fieldErrors.email}
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

          <Button title={submitting ? 'Registering credentials…' : 'Register Student Account'} onPress={submit} loading={submitting} style={{ marginTop: spacing.s }} />

          <View style={styles.loginRow}>
            <Text style={[styles.loginText, { color: c.sub }]}>Already have an account? </Text>
            <Pressable onPress={() => router.replace('/login')} accessibilityRole="link">
              <Text style={[styles.loginLink, { color: c.primary }]}>Sign in</Text>
            </Pressable>
          </View>

          <View style={[styles.noteCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[styles.noteTitle, { color: c.text }]}>Student Safety Protection Privileges</Text>
            <Text style={[styles.noteLine, { color: c.sub }]}>
              Registration activates 1-tap SOS alerts, confidential incident reporting, night walk escort sessions, and access to campus emergency contact auto-alerts.
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
  strengthRow: { flexDirection: 'row', alignItems: 'center', marginTop: -6, marginBottom: spacing.m },
  strengthTrack: { flex: 1, height: 5, borderRadius: 3, marginRight: spacing.s, overflow: 'hidden' },
  strengthLabel: { fontSize: 11.5, fontWeight: '700', minWidth: 64, textAlign: 'right' },
  loginRow: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.l },
  loginText: { fontSize: 14 },
  loginLink: { fontWeight: '700', fontSize: 14 },
  noteCard: {
    marginTop: spacing.xl,
    borderRadius: radius.l,
    borderWidth: 1,
    padding: spacing.m,
  },
  noteTitle: { fontWeight: '700', fontSize: 13, marginBottom: 6 },
  noteLine: { fontSize: 12.5, lineHeight: 19 },
});
