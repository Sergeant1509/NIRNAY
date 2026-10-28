import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, BellRing, FileText, ClipboardCheck, Files, ShieldCheck } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import { apiRequest, type UserDocument, type UserProfile, type UserRecord } from '../lib/api';
import { enablePushNotifications, listenForForegroundNotifications, resumePushNotificationsIfAllowed } from '../services/notifications';

type ApplicationSummary = { id: string; tenderTitle?: string; tender_title?: string; status: string; createdAt?: string; created_at?: string };

export default function DashboardPage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [records, setRecords] = useState<UserRecord[]>([]);
  const [documents, setDocuments] = useState<UserDocument[]>([]);
  const [applications, setApplications] = useState<ApplicationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest<UserProfile>('/api/v1/auth/me'),
      apiRequest<UserRecord[]>('/api/v1/records'),
      apiRequest<UserDocument[]>('/api/v1/documents'),
      apiRequest<{ items: ApplicationSummary[] }>('/api/v1/applications'),
    ]).then(([p, r, d, a]) => {
      if (!active) return;
      setProfile(p); setRecords(r); setDocuments(d); setApplications(a.items);
    }).catch(e => {
      if (active) setError(e instanceof Error ? e.message : 'Could not load your workspace overview.');
    }).finally(() => { if (active) setLoading(false); });
    resumePushNotificationsIfAllowed().catch(() => undefined);
    let unsubscribe: (() => void) | undefined;
    listenForForegroundNotifications(payload => {
      if (active) setMessage((payload.notification?.title || 'NIRNAY update') + ': ' + (payload.notification?.body || 'You have a new update.'));
    }).then(stop => { if (active) unsubscribe = stop; else stop(); }).catch(() => undefined);
    return () => { active = false; unsubscribe?.(); };
  }, []);

  async function turnOnNotifications() {
    setError(''); setMessage('');
    try { await enablePushNotifications(); setMessage('Push notifications enabled for this browser.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not enable notifications.'); }
  }

  return <main className="workspace">
    <header className="page-heading"><div><p className="eyebrow">WORKSPACE / OVERVIEW</p><h1>Good to see you{user?.displayName ? ', ' + user.displayName.split(' ')[0] : ''}</h1><p className="muted">A clear view of your procurement workspace and recent activity.</p></div><span className="role-chip"><ShieldCheck size={15}/>{profile?.role || 'user'} account</span></header>
    {error && <div className="error-box" role="alert">{error}</div>}{message && <div className="success-box" role="status">{message}</div>}
    <section className="overview-welcome"><div><p className="eyebrow">NIRNAY WORKSPACE</p><h2>Documents, tenders, and decisions — in one place.</h2><p>Manage your evidence library and keep track of tender applications from a single workspace.</p><Link className="welcome-action" to="/tenders">Open tenders & applications <ArrowUpRight size={16}/></Link></div><div className="welcome-symbol"><ClipboardCheck size={62} strokeWidth={1.15}/></div></section>
    <section className="overview-stats" aria-label="Workspace totals">
      <Link to="/records" className="overview-stat"><span className="stat-icon"><ClipboardCheck size={19}/></span><span className="stat-label">My records</span><strong>{loading ? '—' : records.length}</strong><small>Saved notes and records <ArrowUpRight size={13}/></small></Link>
      <Link to="/documents" className="overview-stat"><span className="stat-icon"><Files size={19}/></span><span className="stat-label">Documents</span><strong>{loading ? '—' : documents.length}</strong><small>Private uploaded files <ArrowUpRight size={13}/></small></Link>
      <Link to="/tenders" className="overview-stat"><span className="stat-icon"><FileText size={19}/></span><span className="stat-label">Applications</span><strong>{loading ? '—' : applications.length}</strong><small>Your submitted applications <ArrowUpRight size={13}/></small></Link>
    </section>
    <section className="overview-bottom-grid">
      <article className="panel overview-panel"><p className="eyebrow">QUICK ACCESS</p><h2>Continue your work</h2><div className="quick-link-list"><Link to="/documents"><span className="quick-link-icon"><Files size={18}/></span><span><strong>Document library</strong><small>Upload or download tender evidence</small></span><ArrowUpRight size={16}/></Link><Link to="/records"><span className="quick-link-icon"><ClipboardCheck size={18}/></span><span><strong>My records</strong><small>Keep review notes and working records</small></span><ArrowUpRight size={16}/></Link><Link to="/tenders"><span className="quick-link-icon"><FileText size={18}/></span><span><strong>Tenders & applications</strong><small>Browse tenders and manage submissions</small></span><ArrowUpRight size={16}/></Link></div></article>
      <article className="panel overview-panel notification-panel"><span className="section-icon"><BellRing size={19}/></span><p className="eyebrow">NOTIFICATIONS</p><h2>Keep up with updates</h2><p className="muted">Allow browser notifications for supported NIRNAY updates on this device.</p><button onClick={() => void turnOnNotifications()}>Enable notifications</button><p className="fine-print">You can continue using the workspace without enabling notifications.</p></article>
    </section>
    <footer className="page-footer">Signed in as {profile?.email || user?.email || 'your account'} · Access is controlled by the NIRNAY API.</footer>
  </main>;
}
