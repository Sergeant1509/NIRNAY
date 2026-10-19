import { useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut, updateProfile } from 'firebase/auth';
import { AuthContext, type AuthContextValue } from './auth-context';
import { auth } from '../lib/firebase';

function requireAuth() {
  if (!auth) {
    throw new Error('Firebase is not configured. Copy frontend/.env.example to frontend/.env.local and add Firebase Web App settings.');
  }
  return auth;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<import('firebase/auth').User | null>(null);
  // When Firebase is unconfigured, initialize loading as false instead of updating it synchronously in an effect.
  const [loading, setLoading] = useState(Boolean(auth));

  useEffect(() => {
    if (!auth) return undefined;
    return onAuthStateChanged(auth, next => {
      setUser(next);
      setLoading(false);
    });
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    async signIn(email, password) {
      await signInWithEmailAndPassword(requireAuth(), email.trim(), password);
    },
    async signUp(name, email, password) {
      const credential = await createUserWithEmailAndPassword(requireAuth(), email.trim(), password);
      if (name.trim()) await updateProfile(credential.user, { displayName: name.trim() });
      await credential.user.getIdToken(true);
    },
    async signOut() {
      await firebaseSignOut(requireAuth());
    },
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
