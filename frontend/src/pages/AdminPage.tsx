import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest, type UserProfile } from '../lib/api';
import './AdminPage.css';

type Person = { uid: string; email: string | null; display_name: string | null; role: 'user' | 'reviewer' | 'admin'; email_verified: boolean; last_login_at: string | null };
type Stats = { users: number; tenders: number; audit_events: number; generated_at: string; note: string };
type Audit = { id: string; actor_email: string | null; action: string; target_uid: string; created_at: string | null };

export default function AdminPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [events, setEvents] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');

  async function load() {
    setError('');
    const result = await Promise.all([
      apiRequest<UserProfile>('/api/v1/auth/me'),
      apiRequest<Stats>('/api/v1/admin/overview'),
      apiRequest<{ items: Person[] }>('/api/v1/admin/users?limit=50'),
      apiRequest<{ items: Audit[] }>('/api/v1/admin/audit?limit=30'),
    ]);
    setProfile(result[0]); setStats(result[1]); setPeople(result[2].items); setEvents(result[3].items);
  }

  useEffect(() => {
    let alive = true;
    load().catch(e => { if (alive) setError(e instanceof Error ? e.message : 'Unable to load admin data.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  async function setRole(person: Person, role: Person['role']) {
    setBusy(person.uid); setError(''); setMessage('');
    try {
      await apiRequest('/api/v1/admin/users/' + encodeURIComponent(person.uid) + '/role', {
        method: 'PATCH', body: JSON.stringify({ role }),
      });
      setMessage('Role updated. The user must refresh their ID token for the change to take effect.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Role update failed.'); }
    finally { setBusy(''); }
  }

  if (loading) return <main className="centered-page"><p>Loading administrator console…</p></main>;
  if (error.includes('403') || error.includes('Administrator access is required')) return <main className="centered-page"><section className="admin-denied"><h1>Access denied</h1><p>Your account does not have the administrator role.</p><Link to="/app">Return to workspace</Link></section></main>;

  return <main className="admin-shell">
    <header className="admin-header"><div><p className="eyebrow">NIRNAY / CONTROL PLANE</p><h1>Administration</h1><p className="muted">Manage access and review privileged actions.</p></div><Link className="admin-link" to="/app">User workspace</Link></header>
    {error && <div className="error-box" role="alert">{error}</div>}
    {message && <div className="success-box" role="status">{message}</div>}
    {profile?.role !== 'admin' && !error && <div className="notice">This page is available only to an administrator provisioned through Firebase custom claims.</div>}
    <section className="admin-stats">
      <article className="admin-stat"><span>Registered profiles</span><strong>{stats?.users ?? '—'}</strong><small>Firestore user profiles</small></article>
      <article className="admin-stat"><span>Persisted tenders</span><strong>{stats?.tenders ?? '—'}</strong><small>Stored tender records</small></article>
      <article className="admin-stat"><span>Audit events</span><strong>{stats?.audit_events ?? '—'}</strong><small>Recorded admin actions</small></article>
    </section>
    <section className="admin-panel"><div className="admin-section-heading"><div><p className="eyebrow">IDENTITY & ACCESS</p><h2>User roles</h2></div><button className="button-secondary" onClick={() => void load()}>Refresh</button></div>
      <p className="muted">Roles are stored as Firebase Authentication custom claims and enforced by FastAPI.</p>
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>User</th><th>Email status</th><th>Role</th><th>Last login</th><th>Change role</th></tr></thead><tbody>
        {people.map(person => <tr key={person.uid}><td><strong>{person.display_name || 'Unnamed user'}</strong><small>{person.email || person.uid}</small></td><td>{person.email_verified ? 'Verified' : 'Unverified'}</td><td><span className="admin-role">{person.role}</span></td><td>{person.last_login_at ? new Date(person.last_login_at).toLocaleDateString() : '—'}</td><td><select aria-label={'Role for ' + (person.email || person.uid)} value={person.role} disabled={busy === person.uid || person.uid === profile?.uid || profile?.role !== 'admin'} onChange={e => void setRole(person, e.target.value as Person['role'])}><option value="user">User</option><option value="reviewer">Reviewer</option><option value="admin">Admin</option></select></td></tr>)}
      </tbody></table></div>
      {people.length === 0 && <p className="muted">No user profiles found.</p>}
    </section>
    <section className="admin-panel"><p className="eyebrow">ACCOUNTABILITY</p><h2>Recent audit events</h2>{events.length === 0 ? <p className="muted">No admin actions recorded yet.</p> : <ul className="admin-audit-list">{events.map(event => <li key={event.id}><div><strong>{event.action}</strong><small>By {event.actor_email || 'unknown'} · target {event.target_uid}</small></div><time>{event.created_at ? new Date(event.created_at).toLocaleString() : 'Pending timestamp'}</time></li>)}</ul>}</section>
    <p className="admin-footnote">{stats?.note} · Refreshed {stats?.generated_at ? new Date(stats.generated_at).toLocaleString() : '—'}.</p>
  </main>;
}
