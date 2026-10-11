import React, { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { LoadingScreen } from './Feedback';

/**
 * Redirects to /login when there is no session. Wrap every protected screen.
 * While the saved token is being re-validated, a loading screen is shown.
 */
export function AuthGate({ children }) {
  const { user, initializing } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!initializing && !user) router.replace('/login');
  }, [initializing, user, router]);

  if (initializing) return <LoadingScreen label="Checking your session…" />;
  if (!user) return null;
  return children;
}

/** Restricts a screen to ONE role; redirects to the correct home otherwise. */
export function RoleGate({ role, children }) {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!user) return;
    if (user.role !== role) {
      router.replace(user.role === 'STUDENT' ? '/home' : '/dashboard');
    }
  }, [user, role, router]);

  if (!user || user.role !== role) return null;
  return children;
}

const STAFF_ROLES = ['RESPONDER', 'ADMIN'];

/** Restricts a screen to staff (RESPONDER or ADMIN). */
export function StaffGate({ children }) {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!user) return;
    if (!STAFF_ROLES.includes(user.role)) {
      router.replace('/home');
    }
  }, [user, router]);

  if (!user || !STAFF_ROLES.includes(user.role)) return null;
  return children;
}
