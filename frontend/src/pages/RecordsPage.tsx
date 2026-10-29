import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { FilePlus2, Trash2, ClipboardList, RefreshCw } from 'lucide-react';
import { apiRequest, type UserRecord } from '../lib/api';

export default function RecordsPage() {
  const [records, setRecords] = useState<UserRecord[]>([]);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setError('');
    try { setRecords(await apiRequest<UserRecord[]>('/api/v1/records')); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load records.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    // Initial data loading is an external synchronization; state updates occur after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      await apiRequest<UserRecord>('/api/v1/records', { method: 'POST', body: JSON.stringify({ title: title.trim(), kind: 'verification_note', data: { note: note.trim() } }) });
      setTitle(''); setNote(''); await load(); setMessage('Record saved.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save record.'); }
    finally { setBusy(false); }
  }
  async function remove(record: UserRecord) {
    if (!window.confirm('Delete "' + record.title + '"? This cannot be undone.')) return;
    setError(''); setMessage('');
    try { await apiRequest<void>('/api/v1/records/' + encodeURIComponent(record.id), { method: 'DELETE' }); await load(); setMessage('Record deleted.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not delete record.'); }
  }

  return <main className="workspace">
    <header className="page-heading"><div><p className="eyebrow">WORKSPACE / RECORDS</p><h1>My records</h1><p className="muted">Keep review notes and working records in one private place.</p></div><button className="button-secondary" onClick={() => void load()}><RefreshCw size={15}/> Refresh</button></header>
    {error && <div className="error-box" role="alert">{error}</div>}{message && <div className="success-box" role="status">{message}</div>}
    <section className="content-grid records-layout">
      <article className="panel"><div className="section-title-row"><span className="section-icon"><FilePlus2 size={19}/></span><div><h2>New record</h2><p className="muted">Create a note linked to your account.</p></div></div>
        <form className="form-stack" onSubmit={create}><label>Record title<input required maxLength={160} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Review eligibility certificate"/></label><label>Notes<textarea rows={5} maxLength={5000} value={note} onChange={e => setNote(e.target.value)} placeholder="Add context, follow-up actions, or review notes."/></label><button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save record'}</button></form>
      </article>
      <article className="panel"><div className="section-title-row"><span className="section-icon"><ClipboardList size={19}/></span><div><h2>Saved records <span className="count-pill">{records.length}</span></h2><p className="muted">Only records belonging to your account are shown.</p></div></div>
        {loading ? <p className="muted">Loading records…</p> : records.length === 0 ? <div className="empty-state"><ClipboardList size={25}/><strong>No records yet</strong><p>Create your first record using the form.</p></div> : <ul className="record-list">{records.map(record => <li key={record.id}><div className="record-main"><strong>{record.title}</strong><p className="muted">{record.kind.replaceAll('_', ' ')} · {record.created_at ? new Date(record.created_at).toLocaleString() : 'Date unavailable'}</p>{typeof record.data.note === 'string' && record.data.note && <p className="record-note">{record.data.note}</p>}</div><button className="icon-button danger-icon" aria-label={'Delete ' + record.title} title="Delete record" onClick={() => void remove(record)}><Trash2 size={16}/></button></li>)}</ul>}
      </article>
    </section>
  </main>;
}
