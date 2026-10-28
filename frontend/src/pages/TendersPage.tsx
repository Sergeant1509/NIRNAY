import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest, type UserDocument, type UserProfile } from '../lib/api';
import './TendersPage.css';

type Requirement = { id?: string; title: string; description: string; mandatory: boolean; category: string; expected_evidence: string[] };
type Tender = { id: string; tender_number: string; title: string; organization: string; description?: string; status: string; deadline?: string | null; requirements: Requirement[] };
type Application = { id: string; tenderId: string; tenderTitle: string; organizationName: string; status: string; latestVerificationRunId?: string };
type Finding = { requirement_title: string; outcome: string; reason: string; matched_filenames: string[] };
type Evaluation = { status: string; findings: Finding[]; disclaimer: string };
type TenderExtraction = { fields: { tender_number: string; title: string; organization: string; deadline: string; emd: string; tender_fee: string; requirements: Requirement[] }; extraction_method: string; text_characters: number; text_preview: string; disclaimer: string };

export default function TendersPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [documents, setDocuments] = useState<UserDocument[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [organization, setOrganization] = useState('');
  const [tenderNumber, setTenderNumber] = useState('');
  const [title, setTitle] = useState('');
  const [issuer, setIssuer] = useState('');
  const [description, setDescription] = useState('');
  const [requirementsText, setRequirementsText] = useState('GST registration | Provide GST certificate | LEGAL | GST certificate, GSTIN');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [evaluations, setEvaluations] = useState<Record<string, Evaluation>>({});

  const load = useCallback(async () => {
    const [p, t, d, a] = await Promise.all([
      apiRequest<UserProfile>('/api/v1/auth/me'),
      apiRequest<{ items: Tender[] }>('/api/v1/tenders'),
      apiRequest<UserDocument[]>('/api/v1/documents'),
      apiRequest<{ items: Application[] }>('/api/v1/applications'),
    ]);
    setProfile(p); setTenders(t.items); setDocuments(d); setApplications(a.items);
  }, []);

  useEffect(() => {
    let alive = true;
    // Initial data loading is an external synchronization; state updates occur after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch(e => { if (alive) setError(e instanceof Error ? e.message : 'Could not load tender data.'); });
    return () => { alive = false; };
  }, [load]);

  async function extractTender(file?: File) {
    if (!file) return;
    setOcrBusy(true); setError(''); setMessage('');
    try {
      const form = new FormData();
      form.append('file', file);
      const result = await apiRequest<TenderExtraction>('/api/v1/tender-documents/extract', { method: 'POST', body: form });
      const fields = result.fields;
      if (fields.tender_number) setTenderNumber(fields.tender_number);
      if (fields.title) setTitle(fields.title);
      if (fields.organization) setIssuer(fields.organization);
      if (fields.deadline) setDescription(current => [current, 'Submission deadline (extracted; verify): ' + fields.deadline].filter(Boolean).join('\n'));
      if (fields.emd || fields.tender_fee) setDescription(current => [current, fields.emd ? 'EMD (extracted; verify): ' + fields.emd : '', fields.tender_fee ? 'Tender fee (extracted; verify): ' + fields.tender_fee : ''].filter(Boolean).join('\\n'));
      if (fields.requirements.length) {
        setRequirementsText(fields.requirements.map(item => [item.title, item.description, 'REVIEW', item.title].join(' | ')).join('\\n'));
      }
      setMessage('Extracted using ' + result.extraction_method + '. Review every populated field and clause before publishing. ' + result.text_characters + ' characters read.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not extract this tender document.'); }
    finally { setOcrBusy(false); }
  }

  async function createTender(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const requirements: Requirement[] = requirementsText.split('\n').map(line => line.trim()).filter(Boolean).map((line, index) => {
        const [reqTitle, reqDescription, category, evidence] = line.split('|').map(part => part.trim());
        if (!reqTitle || !reqDescription || !category || !evidence) throw new Error('Each requirement line must be: Title | Description | CATEGORY | evidence phrase, evidence phrase');
        return { id: 'req-' + (index + 1), title: reqTitle, description: reqDescription, category, mandatory: true, expected_evidence: evidence.split(',').map(part => part.trim()).filter(Boolean) };
      });
      await apiRequest('/api/v1/tenders', { method: 'POST', body: JSON.stringify({ tender_number: tenderNumber, title, organization: issuer, description, status: 'open', requirements }) });
      setTenderNumber(''); setTitle(''); setIssuer(''); setDescription('');
      await load(); setMessage('Tender published.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create tender.'); }
    finally { setBusy(false); }
  }

  async function apply(tender: Tender) {
    if (!organization.trim()) { setError('Enter your bidder organization name first.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      await apiRequest('/api/v1/applications', { method: 'POST', body: JSON.stringify({ tender_id: tender.id, organization_name: organization, document_ids: selectedDocs, status: 'submitted' }) });
      await load(); setMessage('Application submitted. It is available in Your applications.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not submit application.'); }
    finally { setBusy(false); }
  }

  async function evaluate(application: Application) {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await apiRequest<Evaluation>('/api/v1/applications/' + encodeURIComponent(application.id) + '/evaluate', { method: 'POST' });
      setEvaluations(previous => ({ ...previous, [application.id]: result }));
      setMessage('Preliminary screening completed. Human review is still required.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not screen application.'); }
    finally { setBusy(false); }
  }

  const canManage = profile?.role === 'admin' || profile?.role === 'reviewer';

  return <main className="tenders-shell">
    <header className="tenders-header"><div><p className="eyebrow">NIRNAY / PROCUREMENT</p><h1>Tenders & applications</h1><p className="muted">Browse published tenders, submit evidence, and run a preliminary document screen.</p></div><Link className="tenders-back" to="/app">Workspace</Link></header>
    {error && <div className="tender-alert tender-error" role="alert">{error}</div>}
    {message && <div className="tender-alert tender-success" role="status">{message}</div>}

    {canManage && <section className="tender-panel"><h2>Publish a tender</h2><p className="muted">One requirement per line: Title | Description | CATEGORY | evidence phrase, evidence phrase.</p>
      <div className="tender-ocr-box"><h3>Auto-fill from tender document</h3><p className="muted">Upload a PDF or scanned image to extract available tender fields and likely requirements. Extraction is a draft and must be verified.</p><label className="tender-upload"> <span>{ocrBusy ? 'Extracting document…' : 'Choose tender PDF or image'}</span><input type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" disabled={ocrBusy || busy} onChange={e => { void extractTender(e.target.files?.[0]); e.currentTarget.value = ''; }} /></label></div>
      <form className="tender-form" onSubmit={createTender}>
        <label>Tender number<input required minLength={2} value={tenderNumber} onChange={e => setTenderNumber(e.target.value)} /></label>
        <label>Tender title<input required minLength={3} value={title} onChange={e => setTitle(e.target.value)} /></label>
        <label>Issuing organization<input required value={issuer} onChange={e => setIssuer(e.target.value)} /></label>
        <label>Description<textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} /></label>
        <label className="wide-field">Requirements<textarea required value={requirementsText} onChange={e => setRequirementsText(e.target.value)} rows={3} /></label>
        <button disabled={busy} type="submit">{busy ? 'Saving…' : 'Publish tender'}</button>
      </form>
    </section>}

    <section className="tender-panel"><div className="tender-panel-heading"><h2>Open tenders</h2><button className="tender-secondary" onClick={() => void load()} disabled={busy}>Refresh</button></div>
      {tenders.length === 0 ? <p className="muted">No persisted open tenders yet. {canManage ? 'Publish one above to start the workflow.' : 'Check back when a tender is published.'}</p> : <div className="tender-grid">{tenders.map(tender => <article className="tender-card" key={tender.id}><span className="tender-status">{tender.status}</span><h3>{tender.title}</h3><p className="muted">{tender.tender_number} · {tender.organization}</p><p>{tender.description || 'No description provided.'}</p><p className="muted">{tender.requirements?.length || 0} requirements</p><button disabled={busy} onClick={() => void apply(tender)}>Submit application</button></article>)}</div>}
      <div className="application-compose"><label>Bidder organization<input value={organization} onChange={e => setOrganization(e.target.value)} placeholder="Your registered business name" /></label><fieldset><legend>Select documents from your private uploads</legend>{documents.length === 0 ? <p className="muted">Upload documents in your workspace first.</p> : documents.map(doc => <label className="document-choice" key={doc.id}><input type="checkbox" checked={selectedDocs.includes(doc.id)} onChange={e => setSelectedDocs(current => e.target.checked ? [...current, doc.id] : current.filter(id => id !== doc.id))} />{doc.filename}</label>)}</fieldset><p className="muted">The organization and selected documents apply to the tender when you click its Submit application button.</p></div>
    </section>

    <section className="tender-panel"><h2>Your applications</h2>{applications.length === 0 ? <p className="muted">You have not submitted any applications yet.</p> : <div className="application-list">{applications.map(application => <article key={application.id} className="application-row"><div><h3>{application.tenderTitle || application.tenderId}</h3><p className="muted">{application.organizationName} · {application.status}</p></div><button className="tender-secondary" disabled={busy} onClick={() => void evaluate(application)}>Run preliminary screen</button>{evaluations[application.id] && <div className="evaluation-results"><strong>Screening: {evaluations[application.id].status}</strong><p className="muted">{evaluations[application.id].disclaimer}</p><ul>{evaluations[application.id].findings.map((finding, index) => <li key={finding.requirement_title + index}><strong>{finding.requirement_title}: {finding.outcome}</strong><p>{finding.reason}</p></li>)}</ul></div>}</article>)}</div>}</section>
  </main>;
}
