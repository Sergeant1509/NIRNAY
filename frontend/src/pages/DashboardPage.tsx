import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/useAuth';
import { apiDownload, apiRequest, type UserDocument, type UserProfile, type UserRecord } from '../lib/api';
import { enablePushNotifications, listenForForegroundNotifications, resumePushNotificationsIfAllowed } from '../services/notifications';

export default function DashboardPage() {
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [records, setRecords] = useState<UserRecord[]>([]);
  const [documents, setDocuments] = useState<UserDocument[]>([]);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const loadData = useCallback(async () => {
    const [p, r, d] = await Promise.all([
      apiRequest<UserProfile>('/api/v1/auth/me'),
      apiRequest<UserRecord[]>('/api/v1/records'),
      apiRequest<UserDocument[]>('/api/v1/documents'),
    ]);
    setProfile(p); setRecords(r); setDocuments(d);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadInitialData = async () => {
      try {
        const [p, r, d] = await Promise.all([
          apiRequest<UserProfile>('/api/v1/auth/me'),
          apiRequest<UserRecord[]>('/api/v1/records'),
          apiRequest<UserDocument[]>('/api/v1/documents'),
        ]);
        if (cancelled) return;
        setProfile(p); setRecords(r); setDocuments(d);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load workspace data.');
      }
    };
    void loadInitialData();
    resumePushNotificationsIfAllowed().catch(() => undefined);
    let stop: (() => void) | undefined;
    listenForForegroundNotifications(payload => {
      setMessage((payload.notification?.title || 'NIRNAY update') + ': ' + (payload.notification?.body || 'You have a new update.'));
    }).then(unsubscribe => { if (cancelled) unsubscribe(); else stop = unsubscribe; }).catch(() => undefined);
    return () => { cancelled = true; stop?.(); };
  }, []);

  async function createRecord(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      await apiRequest<UserRecord>('/api/v1/records', { method: 'POST', body: JSON.stringify({ title, kind: 'verification_note', data: { note } }) });
      setTitle(''); setNote(''); await loadData(); setMessage('Record saved in your private workspace.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save record.'); }
    finally { setBusy(false); }
  }
  async function uploadDocument(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) { setError('Choose a file first.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const form = new FormData(); form.append('file', file);
      await apiRequest<UserDocument>('/api/v1/documents', { method: 'POST', body: form });
      setFile(null);
      const input = window.document.getElementById('document-file') as HTMLInputElement | null;
      if (input) input.value = '';
      await loadData(); setMessage('Document uploaded to private Firebase Storage.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not upload document.'); }
    finally { setBusy(false); }
  }
  async function downloadDocument(doc: UserDocument) {
    setError(''); setMessage('');
    try {
      const blob = await apiDownload('/api/v1/documents/' + encodeURIComponent(doc.id) + '/download');
      const url = URL.createObjectURL(blob); const anchor = window.document.createElement('a');
      anchor.href = url; anchor.download = doc.filename; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not download document.'); }
  }
  async function deleteDocument(doc: UserDocument) {
    setError(''); setMessage('');
    try { await apiRequest<void>('/api/v1/documents/' + encodeURIComponent(doc.id), { method: 'DELETE' }); await loadData(); setMessage('Document deleted.'); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not delete document.'); }
  }
  async function deleteRecord(id: string) {
    setError(''); setMessage('');
    try { await apiRequest<void>('/api/v1/records/' + encodeURIComponent(id), { method: 'DELETE' }); await loadData(); setMessage('Record deleted.'); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not delete record.'); }
  }
  async function enableNotifications() {
    setError(''); setMessage('');
    try { await enablePushNotifications(); setMessage('Push notifications enabled for this browser.'); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not enable notifications.'); }
  }

  return <main className="workspace">
    <header className="topbar"><div><p className="eyebrow">NIRNAY WORKSPACE</p><h1>Welcome{user?.displayName ? ', ' + user.displayName : ''}</h1></div>
      <div className="topbar-actions"><span className="user-pill">{user?.email || 'Signed in'}</span><button className="button-secondary" onClick={() => void signOut()}>Sign out</button></div>
    </header>
    {error && <div className="error-box" role="alert">{error}</div>}
    {message && <div className="success-box" role="status">{message}</div>}
    <section className="summary-grid">
      <article className="panel"><p className="eyebrow">ACCOUNT</p><h2>{profile?.display_name || user?.displayName || 'NIRNAY user'}</h2><p className="muted">{profile?.email || user?.email}</p><span className={'status-chip ' + (profile?.email_verified ? 'status-good' : '')}>{profile?.email_verified ? 'Email verified' : 'Email not verified'}</span></article>
      <article className="panel"><p className="eyebrow">SAVED RECORDS</p><h2 className="big-number">{records.length}</h2><p className="muted">Stored under your authenticated Firebase UID.</p></article>
      <article className="panel"><p className="eyebrow">NOTIFICATIONS</p><h2>Stay updated</h2><p className="muted">Enable browser push for trusted NIRNAY backend workflows.</p><button onClick={() => void enableNotifications()}>Enable notifications</button></article>
    </section>
    <section className="content-grid">
      <article className="panel"><p className="eyebrow">FIRESTORE VIA FASTAPI</p><h2>Save a record</h2><p className="muted">Sample note storage; adapt it to tender and verification entities.</p>
        <form onSubmit={createRecord} className="form-stack"><label>Record title<input required maxLength={160} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Review GST certificate" /></label><label>Note<textarea rows={4} value={note} onChange={e => setNote(e.target.value)} placeholder="Add a short note or reminder" /></label><button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save record'}</button></form>
      </article>
      <article className="panel"><p className="eyebrow">YOUR RECORDS</p><h2>Recent records</h2>{records.length === 0 ? <p className="muted">No saved records yet.</p> : <ul className="record-list">{records.map(r => <li key={r.id}><div><strong>{r.title}</strong><p className="muted">{r.kind.replace('_', ' ')} · {r.created_at ? new Date(r.created_at).toLocaleString() : 'just now'}</p>{typeof r.data.note === 'string' && <p>{r.data.note}</p>}</div><button className="button-danger" onClick={() => void deleteRecord(r.id)}>Delete</button></li>)}</ul>}</article>
      <article className="panel"><p className="eyebrow">FIREBASE STORAGE</p><h2>Private tender documents</h2><p className="muted">PDF, PNG/JPG, DOCX, XLSX, or TXT; maximum 15 MiB per upload.</p>
        <form onSubmit={uploadDocument} className="form-stack"><label>Choose a document<input id="document-file" type="file" accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.txt" required onChange={e => setFile(e.target.files?.[0] || null)} /></label><button type="submit" disabled={busy || !file}>{busy ? 'Uploading…' : 'Upload document'}</button></form>
        {documents.length === 0 ? <p className="muted">No uploaded documents yet.</p> : <ul className="record-list">{documents.map(d => <li key={d.id}><div><strong>{d.filename}</strong><p className="muted">{(d.size_bytes / 1024).toFixed(1)} KB · {d.created_at ? new Date(d.created_at).toLocaleString() : 'just now'}</p><button className="button-secondary" onClick={() => void downloadDocument(d)}>Download</button></div><button className="button-danger" onClick={() => void deleteDocument(d)}>Delete</button></li>)}</ul>}
      </article>
    </section>
    <footer className="page-footer">Firebase Authentication verifies identity · FastAPI authorizes access · Firestore stores records · Storage stores private files.</footer>
  </main>;
}
