import { useEffect, useRef, useState, type FormEvent } from 'react';
import { FileText, FileUp, Download, Trash2, RefreshCw, ShieldCheck } from 'lucide-react';
import { apiDownload, apiRequest, type UserDocument } from '../lib/api';

const MAX_BYTES = 15 * 1024 * 1024;
const ACCEPTED = '.pdf,.png,.jpg,.jpeg,.docx,.xlsx,.txt';

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<UserDocument[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setError('');
    try { setDocuments(await apiRequest<UserDocument[]>('/api/v1/documents')); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load documents.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) { setError('Choose a document first.'); return; }
    if (file.size > MAX_BYTES) { setError('The selected file exceeds the 15 MiB limit.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const form = new FormData(); form.append('file', file);
      await apiRequest<UserDocument>('/api/v1/documents', { method: 'POST', body: form });
      setFile(null); if (inputRef.current) inputRef.current.value = '';
      await load(); setMessage('Document uploaded to private storage.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not upload document.'); }
    finally { setBusy(false); }
  }
  async function download(doc: UserDocument) {
    setError(''); setMessage('');
    try {
      const blob = await apiDownload('/api/v1/documents/' + encodeURIComponent(doc.id) + '/download');
      const url = URL.createObjectURL(blob); const anchor = window.document.createElement('a');
      anchor.href = url; anchor.download = doc.filename; window.document.body.appendChild(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not download document.'); }
  }
  async function remove(doc: UserDocument) {
    if (!window.confirm('Delete "' + doc.filename + '"? This cannot be undone.')) return;
    setError(''); setMessage('');
    try { await apiRequest<void>('/api/v1/documents/' + encodeURIComponent(doc.id), { method: 'DELETE' }); await load(); setMessage('Document deleted.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not delete document.'); }
  }

  return <main className="workspace">
    <header className="page-heading"><div><p className="eyebrow">WORKSPACE / DOCUMENTS</p><h1>Document library</h1><p className="muted">Upload and manage the evidence documents used in tender applications.</p></div><button className="button-secondary" onClick={() => void load()}><RefreshCw size={15}/> Refresh</button></header>
    {error && <div className="error-box" role="alert">{error}</div>}{message && <div className="success-box" role="status">{message}</div>}
    <section className="panel upload-panel"><div className="section-title-row"><span className="section-icon"><FileUp size={19}/></span><div><h2>Upload a document</h2><p className="muted">Accepted formats: PDF, PNG/JPG, DOCX, XLSX, TXT. Maximum 15 MiB per file.</p></div></div>
      <form className="upload-form" onSubmit={upload}><label className="file-picker"><FileUp size={20}/><span>{file ? file.name : 'Choose a file from your device'}</span><input ref={inputRef} type="file" accept={ACCEPTED} onChange={e => setFile(e.target.files?.[0] || null)} required/></label><button type="submit" disabled={busy || !file}>{busy ? 'Uploading…' : 'Upload document'}</button></form>
      <p className="security-note"><ShieldCheck size={15}/> Documents are accessed through the authenticated API. Do not upload passwords or unrelated sensitive files.</p>
    </section>
    <section className="panel document-library-panel"><div className="section-title-row"><span className="section-icon"><FileText size={19}/></span><div><h2>Your documents <span className="count-pill">{documents.length}</span></h2><p className="muted">Private files available to your account.</p></div></div>
      {loading ? <p className="muted">Loading documents…</p> : documents.length === 0 ? <div className="empty-state"><FileText size={25}/><strong>Your library is empty</strong><p>Upload a document to make it available for applications.</p></div> : <div className="document-table-wrap"><table className="document-table"><thead><tr><th>File</th><th>Size</th><th>Uploaded</th><th>Actions</th></tr></thead><tbody>{documents.map(doc => <tr key={doc.id}><td><span className="file-name"><FileText size={18}/><span>{doc.filename}</span></span></td><td>{(doc.size_bytes / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} KB</td><td>{doc.created_at ? new Date(doc.created_at).toLocaleDateString() : '—'}</td><td><div className="table-actions"><button className="icon-button" aria-label={'Download ' + doc.filename} title="Download" onClick={() => void download(doc)}><Download size={16}/></button><button className="icon-button danger-icon" aria-label={'Delete ' + doc.filename} title="Delete" onClick={() => void remove(doc)}><Trash2 size={16}/></button></div></td></tr>)}</tbody></table></div>}
    </section>
  </main>;
}
