import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { firebaseConfigured } from '../lib/firebase';
export default function RegisterPage() {
  const { user, signUp } = useAuth(); const [name, setName] = useState('');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/app" replace />;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError('');
    try { await signUp(name, email, password); } catch (err) { setError(err instanceof Error ? err.message : 'Could not create your account.'); }
    finally { setBusy(false); }
  }
  return <main className="auth-layout"><section className="auth-card">
    <p className="eyebrow">NIRNAY · SECURE WORKSPACE</p><h1>Create your account</h1>
    <p className="muted">Register with email. Firebase manages the password securely.</p>
    {!firebaseConfigured && <div className="notice">Configure Firebase Web App values in frontend/.env.local before registering.</div>}
    {error && <div className="error-box" role="alert">{error}</div>}
    <form onSubmit={submit} className="form-stack">
      <label>Full name<input autoComplete="name" required maxLength={100} value={name} onChange={e => setName(e.target.value)} /></label>
      <label>Email address<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label>Password<input type="password" autoComplete="new-password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} /><small>Use at least 6 characters, or follow your Firebase password policy.</small></label>
      <button type="submit" disabled={busy || !firebaseConfigured}>{busy ? 'Creating account…' : 'Create account'}</button>
    </form>
    <p className="auth-footer">Already registered? <Link to="/login">Sign in</Link></p>
  </section></main>;
}