import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut, updateProfile, type User } from 'firebase/auth';
import { auth } from '../lib/firebase';

interface AuthContextValue {
  user: User | null; loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}
const AuthContext = createContext<AuthContextValue | undefined>(undefined);
function requireAuth() {
  if (!auth) throw new Error('Firebase is not configured. Copy frontend/.env.example to frontend/.env.local and add Firebase Web App settings.');
  return auth;
}
export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!auth) { setLoading(false); return; }
    return onAuthStateChanged(auth, next => { setUser(next); setLoading(false); });
  }, []);
  const value = useMemo<AuthContextValue>(() => ({
    user, loading,
    async signIn(email, password) { await signInWithEmailAndPassword(requireAuth(), email.trim(), password); },
    async signUp(name, email, password) {
      const credential = await createUserWithEmailAndPassword(requireAuth(), email.trim(), password);
      if (name.trim()) await updateProfile(credential.user, { displayName: name.trim() });
      await credential.user.getIdToken(true);
    },
    async signOut() { await firebaseSignOut(requireAuth()); },
  }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}