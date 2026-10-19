import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { firebaseConfigured } from '../lib/firebase';

export default function LoginPage() {
  const { user, signIn } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || '/app';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to={from} replace />;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError('');
    try { await signIn(email, password); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not sign in.'); }
    finally { setBusy(false); }
  }

  return <main className="auth-layout"><section className="auth-card">
    <p className="eyebrow">NIRNAY · SECURE WORKSPACE</p>
    <h1>Welcome back</h1>
    <p className="muted">Sign in to access your saved records and tender documents.</p>
    {!firebaseConfigured && <div className="notice">Configure Firebase Web App values in frontend/.env.local, then restart Vite.</div>}
    {error && <div className="error-box" role="alert">{error}</div>}
    <form onSubmit={submit} className="form-stack">
      <label>Email address<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label>Password<input type="password" autoComplete="current-password" minLength={6} required value={password} onChange={e => setPassword(e.target.value)} /></label>
      <button type="submit" disabled={busy || !firebaseConfigured}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
    <p className="auth-footer">New to NIRNAY? <Link to="/register">Create an account</Link></p>
    <p className="fine-print">Firebase verifies identity; private data is accessed through the NIRNAY API.</p>
  </section></main>;
}
