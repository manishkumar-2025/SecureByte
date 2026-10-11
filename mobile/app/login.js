import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import Input from '../src/components/Input';
import Button from '../src/components/Button';
import { ErrorBanner } from '../src/components/Feedback';
import { radius, shadowCard, spacing, touchMin, type } from '../src/theme';
import { useTheme } from '../src/hooks/useTheme';
import { useToast } from '../src/components/Toast';

const DEMO_ACCOUNTS = [
  { label: '🎓 Fill Student', email: 'student@securebyte.dev', password: 'Student@123' },
  { label: '🚨 Fill Responder', email: 'responder@securebyte.dev', password: 'Responder@123' },
  { label: '🛡️ Fill Admin', email: 'admin@securebyte.dev', password: 'Admin@12345' },
];

export default function Login() {
  const { signIn } = useAuth();
  const c = useTheme();
  const toast = useToast();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const validate = () => {
    const errs = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = 'Enter a valid email address.';
    if (!password) errs.password = 'Enter your password.';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const submit = async () => {
    setError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      const user = await signIn(email.trim().toLowerCase(), password);
      // Route by the SERVER-confirmed role (never by what the form says).
      router.replace(user.role === 'STUDENT' ? '/home' : '/dashboard');
    } catch (e) {
      setError(e.message);
      toast.error('Sign-in failed', e.message);
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
          <View style={styles.brandBlock}>
            <View style={[styles.logoBadge, { backgroundColor: c.cardElevated, borderColor: c.border }, shadowCard]}>
              <Text style={styles.logo}>🛡️</Text>
            </View>
            <Text style={[styles.brand, { color: c.primary }]}>CampusShield</Text>
            <Text style={[styles.instituteText, { color: c.text }]}>Birsa Institute of Technology, Sindri</Text>
            <Text style={[styles.tagline, { color: c.sub }]}>Official 24×7 Campus Emergency & Incident Dispatch Network</Text>
            
            <View style={[styles.encBadge, { backgroundColor: c.primarySoft }]}>
              <Text style={[styles.encBadgeText, { color: c.primaryDark }]}>🔒 256-Bit SSL Encrypted Campus Network</Text>
            </View>
          </View>

          <ErrorBanner message={error} />

          <Input
            label="Campus Email"
            placeholder="you@securebyte.dev"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            error={fieldErrors.email}
          />
          <Input
            label="Password"
            placeholder="Enter your account password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            error={fieldErrors.password}
          />

          <Button title={submitting ? 'Authenticating…' : 'Sign in to Safety Console'} onPress={submit} loading={submitting} style={{ marginTop: spacing.s }} />

          <View style={styles.registerRow}>
            <Text style={[styles.registerText, { color: c.sub }]}>New student or staff? </Text>
            <Pressable onPress={() => router.push('/register')} accessibilityRole="link">
              <Text style={[styles.registerLink, { color: c.primary }]}>Create an account</Text>
            </Pressable>
          </View>

          <View style={[styles.demoCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Text style={{ fontSize: 14 }}>⚡</Text>
              <Text style={[styles.demoTitle, { color: c.text }]}>Quick Demo Credentials</Text>
            </View>
            <Text style={[styles.demoSub, { color: c.faint }]}>
              Tap any role chip below to auto-populate seeded credentials:
            </Text>
            
            <View style={styles.chipRow}>
              {DEMO_ACCOUNTS.map((acct) => (
                <Pressable
                  key={acct.email}
                  onPress={() => {
                    setEmail(acct.email);
                    setPassword(acct.password);
                    setError(null);
                  }}
                  style={({ pressed }) => [
                    styles.chip,
                    { backgroundColor: c.primarySoft, borderColor: c.border },
                    pressed && styles.chipPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Fill ${acct.label.slice(2).trim()} credentials`}
                >
                  <Text style={[styles.chipText, { color: c.primaryDark }]}>{acct.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <Text style={[styles.disclaimer, { color: c.faint }]}>
            BIT Sindri Campus Safety Desk · In life-threatening emergencies, dial 112 directly.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxl },
  brandBlock: { alignItems: 'center', marginTop: spacing.l, marginBottom: spacing.xl },
  logoBadge: {
    width: 88,
    height: 88,
    borderRadius: radius.xl,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: { fontSize: 44 },
  brand: { ...type.display, fontSize: 28, marginTop: spacing.m },
  instituteText: { fontSize: 14, fontWeight: '700', marginTop: 4 },
  tagline: { fontSize: 12.5, marginTop: 4, textAlign: 'center', paddingHorizontal: spacing.m },
  encBadge: { marginTop: 10, paddingHorizontal: 12, paddingVertical: 4, borderRadius: radius.pill },
  encBadgeText: { fontSize: 10.5, fontWeight: '700' },
  registerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.l },
  registerText: { fontSize: 14 },
  registerLink: { fontWeight: '700', fontSize: 14 },
  demoCard: {
    marginTop: spacing.xl,
    borderRadius: radius.l,
    borderWidth: 1,
    padding: spacing.m,
  },
  demoTitle: { fontWeight: '800', fontSize: 13 },
  demoSub: { fontSize: 11.5, marginBottom: spacing.s },
  chipRow: { flexDirection: 'row', gap: spacing.s, flexWrap: 'wrap' },
  chip: {
    flexGrow: 1,
    flexBasis: '30%',
    borderRadius: radius.pill,
    paddingVertical: 10,
    paddingHorizontal: spacing.s,
    alignItems: 'center',
    minHeight: touchMin,
    justifyContent: 'center',
    borderWidth: 1,
  },
  chipPressed: { opacity: 0.75 },
  chipText: { fontWeight: '800', fontSize: 12 },
  disclaimer: { textAlign: 'center', fontSize: 11.5, marginTop: spacing.xl, lineHeight: 17 },
});
