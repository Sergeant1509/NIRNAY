import { useState, type FormEvent } from 'react';
import { AlertTriangle, CheckCircle2, FileCheck2, FileSearch, FileUp, ShieldAlert } from 'lucide-react';
import { apiRequest } from '../lib/api';
import './DocumentVerificationPage.css';

const documentTypes = [
  { value: 'company_registration', label: 'Company registration details' },
  { value: 'company_profile', label: 'Company profile' },
  { value: 'gst_certificate', label: 'GST registration certificate' },
  { value: 'pan_card', label: 'PAN card' },
  { value: 'turnover_certificate', label: 'Turnover certificate (Annexure 1)' },
  { value: 'solvency_certificate', label: 'Solvency certificate' },
  { value: 'work_completion_certificate', label: 'Similar-work completion certificate' },
  { value: 'electrical_contractor_licence', label: 'A-Class electrical contractor licence' },
  { value: 'manufacturing_facility', label: 'Manufacturing facility details' },
  { value: 'tender_fee_proof', label: 'Tender fee evidence' },
  { value: 'emd_proof', label: 'EMD evidence' },
  { value: 'other', label: 'Other supporting document' },
];

type Check = { code: string; label: string; status: string; detail: string };
type Report = {
  mode: string;
  filename: string;
  document_type: string;
  document_label: string;
  extraction_method: string;
  text_characters: number;
  fields: { business_name?: string | null; pan?: string | null; gstin?: string | null; registration_number?: string | null; expiry_date_text?: string | null; amounts?: Array<{ display: string; value_inr: number }> };
  checks: Check[];
  overall_status: string;
  issuer_verified: boolean;
  stored: boolean;
  review_required: boolean;
  disclaimer: string;
};

const sampleReports: Array<{ title: string; description: string; report: Report }> = [
  {
    title: 'PAN card · sample',
    description: 'Identifier format is found; issuer authenticity remains unchecked.',
    report: {
      mode: 'demo sample', filename: 'SAMPLE_pan_card.txt', document_type: 'pan_card', document_label: 'PAN card',
      extraction_method: 'sample fixture', text_characters: 95,
      fields: { business_name: 'Example Electricals Pvt Ltd', pan: 'ABCDE1234F', amounts: [] },
      checks: [
        { code: 'readable_text', label: 'Readable document text', status: 'pass', detail: 'Sample text was available for demonstration.' },
        { code: 'pan_format', label: 'PAN format', status: 'pass', detail: 'A PAN-shaped sample identifier was extracted. This does not prove that it was issued by the authority.' },
        { code: 'business_name_extracted', label: 'Business name', status: 'pass', detail: 'Sample legal name extracted; compare against authoritative records.' },
        { code: 'issuer_authenticity', label: 'Issuer authenticity', status: 'not_checked', detail: 'No government registry or issuer service was queried.' },
        { code: 'signature_and_tampering', label: 'Digital signature / tampering', status: 'not_checked', detail: 'No signature or tampering validation was performed.' },
      ],
      overall_status: 'extracted_unverified', issuer_verified: false, stored: false, review_required: true,
      disclaimer: 'Synthetic demonstration only. This is not a real PAN or a verified document.',
    },
  },
  {
    title: 'GST certificate · sample',
    description: 'Missing identifier demonstrates conservative manual review.',
    report: {
      mode: 'demo sample', filename: 'SAMPLE_gst_certificate.txt', document_type: 'gst_certificate', document_label: 'GST registration certificate',
      extraction_method: 'sample fixture', text_characters: 71,
      fields: { business_name: 'Example Electricals Pvt Ltd', amounts: [] },
      checks: [
        { code: 'readable_text', label: 'Readable document text', status: 'pass', detail: 'Sample text was available for demonstration.' },
        { code: 'gstin_format', label: 'GSTIN format', status: 'manual_review', detail: 'GSTIN was not found in the sample content.' },
        { code: 'business_name_extracted', label: 'Business name', status: 'pass', detail: 'Sample legal name extracted; compare against authoritative records.' },
        { code: 'issuer_authenticity', label: 'Issuer authenticity', status: 'not_checked', detail: 'No GST portal or issuer service was queried.' },
        { code: 'signature_and_tampering', label: 'Digital signature / tampering', status: 'not_checked', detail: 'No signature or tampering validation was performed.' },
      ],
      overall_status: 'manual_review', issuer_verified: false, stored: false, review_required: true,
      disclaimer: 'Synthetic demonstration only. No real GST data was used.',
    },
  },
  {
    title: 'Turnover certificate · sample',
    description: 'Illustrates a numeric threshold check without claiming authenticity.',
    report: {
      mode: 'demo sample', filename: 'SAMPLE_turnover_certificate.txt', document_type: 'turnover_certificate', document_label: 'Turnover certificate (Annexure 1)',
      extraction_method: 'sample fixture', text_characters: 120,
      fields: { business_name: 'Example Electricals Pvt Ltd', amounts: [{ display: 'INR 15 lakh', value_inr: 1500000 }] },
      checks: [
        { code: 'readable_text', label: 'Readable document text', status: 'pass', detail: 'Sample text was available for demonstration.' },
        { code: 'numeric_amount', label: 'Numeric amount', status: 'pass', detail: 'Sample amount normalised to ₹15,00,000; verify its meaning and financial period.' },
        { code: 'tender_threshold', label: 'Supplied tender turnover threshold', status: 'pass', detail: '₹15 lakh exceeds the sample tender threshold of ₹13.65 lakh. This is not an audit of the accounts.' },
        { code: 'issuer_authenticity', label: 'Issuer authenticity', status: 'not_checked', detail: 'No CA, issuer or tax authority was contacted.' },
        { code: 'signature_and_tampering', label: 'Digital signature / tampering', status: 'not_checked', detail: 'No signature or tampering validation was performed.' },
      ],
      overall_status: 'manual_review', issuer_verified: false, stored: false, review_required: true,
      disclaimer: 'Synthetic demonstration only. Numeric threshold comparison is not a final tender eligibility decision.',
    },
  },
];

function money(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

function statusLabel(status: string) {
  if (status === 'pass') return 'Check passed';
  if (status === 'fail') return 'Check failed';
  if (status === 'not_checked') return 'Not checked';
  return 'Manual review';
}

export default function DocumentVerificationPage() {
  const [documentType, setDocumentType] = useState('pan_card');
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [inputKey, setInputKey] = useState(0);

  async function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) { setError('Choose a sample document file first.'); return; }
    if (file.size > 15 * 1024 * 1024) { setError('Maximum file size is 15 MiB.'); return; }
    setBusy(true); setError(''); setReport(null);
    try {
      const form = new FormData();
      form.append('document_type', documentType);
      form.append('file', file);
      const result = await apiRequest<Report>('/api/v1/document-verification/analyze', { method: 'POST', body: form });
      setReport(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not analyze this document.');
    } finally {
      setBusy(false);
    }
  }

  function showSample(sample: Report) {
    setReport(sample);
    setError('');
  }

  return <main className="verification-page">
    <header className="verification-heading">
      <div>
        <p className="eyebrow">NIRNAY / EVIDENCE SCREENING</p>
        <h1>Document verification</h1>
        <p className="verification-muted">Extract fields, run basic consistency checks, and identify evidence that needs a human reviewer.</p>
      </div>
      <span className="prototype-tag"><ShieldAlert size={15} /> Prototype mode</span>
    </header>

    <div className="verification-notice" role="note">
      <AlertTriangle size={19} />
      <div><strong>Use synthetic or redacted documents only.</strong><p>This student prototype has no DigiLocker, EntityLocker, GST, MCA, bank or issuer connection. It does not authenticate certificates. Uploaded files are processed transiently by this endpoint and are not saved by this analysis feature.</p></div>
    </div>

    {error && <div className="verification-error" role="alert">{error}</div>}

    <section className="verification-panel">
      <div className="verification-section-title"><span className="verification-icon"><FileUp size={20}/></span><div><h2>Analyze a sample document</h2><p>PDF, PNG/JPG, DOCX, XLSX or TXT · maximum 15 MiB</p></div></div>
      <form className="verification-form" onSubmit={analyze}>
        <label>Document type<select value={documentType} onChange={event => setDocumentType(event.target.value)}>{documentTypes.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label className="verification-file"><span>Choose document</span><input key={inputKey} type="file" accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.txt" onChange={event => setFile(event.target.files?.[0] || null)} /><small>{file ? file.name + ' · ' + (file.size / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 }) + ' KB' : 'Select a local sample or synthetic document.'}</small></label>
        <button className="verification-primary" type="submit" disabled={busy || !file}>{busy ? 'Analyzing…' : <><FileSearch size={16}/> Analyze document</>}</button>
      </form>
    </section>

    <section className="verification-panel">
      <div className="verification-section-title"><span className="verification-icon"><FileCheck2 size={20}/></span><div><h2>Demo document wallet</h2><p>Open a synthetic report to demonstrate pass, missing-evidence and manual-review states without uploading a real identity document.</p></div></div>
      <div className="demo-document-grid">{sampleReports.map(sample => <button className="demo-document-card" key={sample.report.filename} onClick={() => showSample(sample.report)}><span className="demo-document-symbol"><FileCheck2 size={19}/></span><strong>{sample.title}</strong><span>{sample.description}</span><small>Open demo report →</small></button>)}</div>
    </section>

    {report && <section className="verification-panel verification-report" aria-live="polite">
      <div className="verification-report-heading"><div><p className="eyebrow">ANALYSIS RESULT · {report.mode.toUpperCase()}</p><h2>{report.document_label}</h2><p className="verification-muted">{report.filename} · {report.extraction_method} · {report.text_characters.toLocaleString()} characters read</p></div><span className={'verification-status ' + report.overall_status}>{report.overall_status === 'manual_review' ? 'Manual review' : 'Extracted · unverified'}</span></div>
      <div className="verification-metrics">
        <div><span>Issuer verified</span><strong>No</strong></div>
        <div><span>File stored by analyzer</span><strong>No</strong></div>
        <div><span>Human review</span><strong>Required</strong></div>
      </div>
      <h3>Extracted fields</h3>
      <div className="verification-fields">
        <div><span>Business / legal name</span><strong>{report.fields.business_name || 'Not detected'}</strong></div>
        <div><span>PAN-shaped identifier</span><strong>{report.fields.pan || 'Not detected'}</strong></div>
        <div><span>GSTIN-shaped identifier</span><strong>{report.fields.gstin || 'Not detected'}</strong></div>
        <div><span>Registration number</span><strong>{report.fields.registration_number || 'Not detected'}</strong></div>
        <div><span>Validity text</span><strong>{report.fields.expiry_date_text || 'Not detected'}</strong></div>
        <div><span>Amounts</span><strong>{report.fields.amounts?.length ? report.fields.amounts.map((amount, index) => <span className="verification-amount" key={amount.display + index}>{amount.display} ({money(amount.value_inr)}) </span>) : 'No amount detected'}</strong></div>
      </div>
      <h3>Checks and review findings</h3>
      <div className="verification-check-list">{report.checks.map(check => <article className="verification-check" key={check.code}><span className={'check-indicator ' + check.status}>{check.status === 'pass' ? <CheckCircle2 size={18}/> : <AlertTriangle size={18}/>}</span><div><div className="verification-check-top"><strong>{check.label}</strong><span className={'check-label ' + check.status}>{statusLabel(check.status)}</span></div><p>{check.detail}</p></div></article>)}</div>
      <div className="verification-disclaimer"><ShieldAlert size={18}/><p>{report.disclaimer}</p></div>
      <button className="verification-secondary" onClick={() => { setReport(null); setFile(null); setInputKey(key => key + 1); }}>Clear report</button>
    </section>}
  </main>;
}
