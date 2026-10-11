import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { radius, shadowCard, spacing, type } from '../src/theme';
import { useTheme } from '../src/hooks/useTheme';

/** Entry screen: routes to Login, Student Home or Responder Dashboard. */
export default function Index() {
  const { user, initializing } = useAuth();
  const c = useTheme();
  const router = useRouter();

  useEffect(() => {
    if (initializing) return;
    if (!user) router.replace('/login');
    else router.replace(user.role === 'STUDENT' ? '/home' : '/dashboard');
  }, [initializing, user, router]);

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={[styles.badge, { backgroundColor: c.cardElevated, borderColor: c.border }, shadowCard]}>
        <Text style={styles.logo}>🛡️</Text>
      </View>
      <Text style={[styles.brand, { color: c.primary }]}>SecureByte</Text>
      <Text style={[styles.tagline, { color: c.sub }]}>Campus emergency alerts & incident reporting</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  badge: {
    width: 108,
    height: 108,
    borderRadius: radius.xl,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.l,
  },
  logo: { fontSize: 56 },
  brand: { ...type.display, fontSize: 28 },
  tagline: { marginTop: spacing.s, fontSize: 13.5 },
});
