import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FileJson2, Plus, RefreshCw, Save, ShieldCheck } from 'lucide-react';
import { apiRequest } from '../lib/api';
import './RuleBuilderPage.css';

type RequirementRule = {
  rule_id: string;
  title: string;
  description: string;
  rule_type: 'numeric_threshold' | 'document_presence' | 'value_match' | 'alternative_group';
  parameters: Record<string, unknown>;
  condition: Record<string, unknown>;
  required_evidence: string[];
  source_reference: Record<string, unknown>;
  severity: 'mandatory' | 'conditional' | 'advisory';
  confidence?: number | null;
};
type Tender = { id: string; tender_number: string; title: string; status: string };
type RuleSet = { id: string; name: string; version: number; status: 'draft' | 'approved' | 'superseded'; rules: RequirementRule[]; changeSummary?: string; approvedAt?: string | null };
const blankRule = (index: number): RequirementRule => ({
  rule_id: 'rule_' + index, title: 'New requirement', description: '',
  rule_type: 'document_presence', parameters: { document_type: 'GST certificate' },
  condition: {}, required_evidence: [], source_reference: {}, severity: 'mandatory', confidence: null,
});
const pretty = (value: unknown) => JSON.stringify(value, null, 2);
const electricalPanelTenderRules: RequirementRule[] = [
  {
    rule_id: 'similar_work_experience', title: 'Similar-work experience', description: 'Meet at least one of the alternative experience routes in the tender.',
    rule_type: 'alternative_group', parameters: { alternatives: [
      [
        { rule_id: 'experience_3_works_count', title: 'Three similar works', rule_type: 'numeric_threshold', parameters: { field: 'similar_works_count', operator: '>=', value: 3 }, condition: {}, source_reference: { page: 3 } },
        { rule_id: 'experience_3_works_value', title: 'Minimum value of each similar work', rule_type: 'numeric_threshold', parameters: { field: 'minimum_similar_work_value_inr', operator: '>=', value: 1100000 }, condition: {}, source_reference: { page: 3 } }
      ],
      [
        { rule_id: 'experience_2_works_count', title: 'Two similar works', rule_type: 'numeric_threshold', parameters: { field: 'similar_works_count', operator: '>=', value: 2 }, condition: {}, source_reference: { page: 3 } },
        { rule_id: 'experience_2_works_value', title: 'Minimum value of each similar work', rule_type: 'numeric_threshold', parameters: { field: 'minimum_similar_work_value_inr', operator: '>=', value: 1640000 }, condition: {}, source_reference: { page: 3 } }
      ],
      [
        { rule_id: 'experience_1_work_count', title: 'One similar work', rule_type: 'numeric_threshold', parameters: { field: 'similar_works_count', operator: '>=', value: 1 }, condition: {}, source_reference: { page: 3 } },
        { rule_id: 'experience_1_work_value', title: 'Minimum value of similar work', rule_type: 'numeric_threshold', parameters: { field: 'minimum_similar_work_value_inr', operator: '>=', value: 2200000 }, condition: {}, source_reference: { page: 3 } }
      ]
    ] }, condition: {}, required_evidence: ['Valid completion certificates for similar works'], source_reference: { page: 3, section: 'Eligibility Criteria' }, severity: 'mandatory'
  },
  { rule_id: 'average_annual_turnover', title: 'Average annual gross turnover', description: 'Minimum average annual gross turnover of ₹13.65 lakh.', rule_type: 'numeric_threshold', parameters: { field: 'average_annual_turnover_inr', operator: '>=', value: 1365000 }, condition: {}, required_evidence: ['Turnover certificate (Annexure 1)'], source_reference: { page: 3, section: 'Eligibility Criteria' }, severity: 'mandatory' },
  { rule_id: 'solvency', title: 'Solvency', description: 'Solvency of at least ₹11 lakh.', rule_type: 'numeric_threshold', parameters: { field: 'solvency_inr', operator: '>=', value: 1100000 }, condition: {}, required_evidence: ['Solvency certificate'], source_reference: { page: 3, section: 'Eligibility Criteria' }, severity: 'mandatory' },
  { rule_id: 'emd_amount', title: 'Earnest money deposit', description: 'EMD amount of ₹55,000.', rule_type: 'numeric_threshold', parameters: { field: 'emd_amount_inr', operator: '>=', value: 55000 }, condition: {}, required_evidence: ['EMD demand draft or accepted evidence'], source_reference: { page: 3, section: 'Eligibility Criteria' }, severity: 'mandatory' },
  { rule_id: 'company_registration', title: 'Company registration', description: 'Provide company registration details.', rule_type: 'document_presence', parameters: { document_type: 'company registration details' }, condition: {}, required_evidence: ['Company registration details'], source_reference: { page: 4, section: 'Technical bid checklist' }, severity: 'mandatory' },
  { rule_id: 'company_profile', title: 'Company profile', description: 'Provide the company profile, including manufacturing facility details and similar works.', rule_type: 'document_presence', parameters: { document_type: 'company profile' }, condition: {}, required_evidence: ['Company profile'], source_reference: { page: 3, section: 'Eligibility Criteria' }, severity: 'mandatory' },
  { rule_id: 'gst_certificate', title: 'GST registration certificate', description: 'Provide a copy of the GST registration certificate.', rule_type: 'document_presence', parameters: { document_type: 'GST registration certificate' }, condition: {}, required_evidence: ['GST certificate'], source_reference: { page: 4, section: 'Technical bid checklist' }, severity: 'mandatory' },
  { rule_id: 'pan_card', title: 'PAN card copy', description: 'Provide a copy of the PAN card.', rule_type: 'document_presence', parameters: { document_type: 'PAN card' }, condition: {}, required_evidence: ['PAN card copy'], source_reference: { page: 4, section: 'Technical bid checklist' }, severity: 'mandatory' },
  { rule_id: 'turnover_certificate', title: 'Turnover certificate', description: 'Provide the turnover certificate in the prescribed annexure.', rule_type: 'document_presence', parameters: { document_type: 'turnover certificate' }, condition: {}, required_evidence: ['Turnover certificate (Annexure 1)'], source_reference: { page: 4, section: 'Technical bid checklist' }, severity: 'mandatory' },
  { rule_id: 'solvency_certificate', title: 'Solvency certificate', description: 'Provide solvency evidence.', rule_type: 'document_presence', parameters: { document_type: 'solvency certificate' }, condition: {}, required_evidence: ['Solvency certificate'], source_reference: { page: 4, section: 'Technical bid checklist' }, severity: 'mandatory' },
  { rule_id: 'completion_certificates', title: 'Similar-work completion certificates', description: 'Provide valid completion certificates for similar works.', rule_type: 'document_presence', parameters: { document_type: 'completion certificates' }, condition: {}, required_evidence: ['Valid completion certificates'], source_reference: { page: 4, section: 'Technical bid checklist' }, severity: 'mandatory' },
  { rule_id: 'electrical_contractor_licence', title: 'A-class electrical contractor licence', description: 'Required for bidders who are not registered original panel manufacturers.', rule_type: 'document_presence', parameters: { document_type: 'A-class electrical contractor licence' }, condition: { field: 'bidder_type', operator: '!=', value: 'registered_original_panel_manufacturer' }, required_evidence: ['A-class electrical contractor licence'], source_reference: { page: 4, section: 'Technical bid checklist' }, severity: 'conditional' }
];


export default function RuleBuilderPage() {
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [tenderId, setTenderId] = useState('');
  const [ruleSets, setRuleSets] = useState<RuleSet[]>([]);
  const [activeRuleSetId, setActiveRuleSetId] = useState('');
  const [name, setName] = useState('Eligibility rules');
  const [changeSummary, setChangeSummary] = useState('');
  const [rulesText, setRulesText] = useState(pretty([blankRule(1)]));
  const [evidenceText, setEvidenceText] = useState(pretty({ turnover_inr: 1400000, solvency_inr: 1100000, documents: [{ document_type: 'GST certificate' }] }));
  const [resultText, setResultText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selectedTender = useMemo(() => tenders.find(item => item.id === tenderId), [tenders, tenderId]);
  const selectedRuleSet = useMemo(() => ruleSets.find(item => item.id === activeRuleSetId), [ruleSets, activeRuleSetId]);

  useEffect(() => {
    let alive = true;
    apiRequest<{ items: Tender[] }>('/api/v1/tenders')
      .then(response => { if (alive) { setTenders(response.items); if (response.items.length) setTenderId(current => current || response.items[0].id); } })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : 'Could not load tenders.'); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    if (tenderId) {
      apiRequest<{ items: RuleSet[]; active_rule_set_id?: string | null }>('/api/v1/tenders/' + encodeURIComponent(tenderId) + '/rule-sets')
        .then(response => { if (alive) { setRuleSets(response.items); setActiveRuleSetId(response.active_rule_set_id || response.items[0]?.id || ''); } })
        .catch(e => { if (alive) setError(e instanceof Error ? e.message : 'Could not load rule sets.'); });
    }
    return () => { alive = false; };
  }, [tenderId]);

  function loadSelected() {
    if (!selectedRuleSet) return;
    setName(selectedRuleSet.name);
    setChangeSummary(selectedRuleSet.changeSummary || '');
    setRulesText(pretty(selectedRuleSet.rules));
    setResultText('');
  }

  async function refresh() {
    if (!tenderId) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await apiRequest<{ items: RuleSet[]; active_rule_set_id?: string | null }>('/api/v1/tenders/' + encodeURIComponent(tenderId) + '/rule-sets');
      setRuleSets(response.items); setActiveRuleSetId(response.active_rule_set_id || response.items[0]?.id || '');
      setNotice('Rule sets refreshed.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not refresh rule sets.'); }
    finally { setBusy(false); }
  }

  async function saveDraft() {
    if (!tenderId) return;
    setBusy(true); setError(''); setNotice(''); setResultText('');
    try {
      const rules = JSON.parse(rulesText) as RequirementRule[];
      if (!Array.isArray(rules)) throw new Error('Rules must be a JSON array.');
      const saved = await apiRequest<RuleSet>('/api/v1/tenders/' + encodeURIComponent(tenderId) + '/rule-sets', {
        method: 'POST',
        body: JSON.stringify({ name, rules, change_summary: changeSummary, source_document: { source: 'reviewer-configured' } }),
      });
      const response = await apiRequest<{ items: RuleSet[] }>('/api/v1/tenders/' + encodeURIComponent(tenderId) + '/rule-sets');
      setRuleSets(response.items); setActiveRuleSetId(saved.id); setNotice('Saved as draft version ' + saved.version + '. It is not active until approved.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save draft. Check the JSON and rule fields.'); }
    finally { setBusy(false); }
  }

  async function approve() {
    if (!tenderId || !selectedRuleSet) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await apiRequest('/api/v1/tenders/' + encodeURIComponent(tenderId) + '/rule-sets/' + encodeURIComponent(selectedRuleSet.id) + '/approve', { method: 'POST' });
      const response = await apiRequest<{ items: RuleSet[]; active_rule_set_id?: string | null }>('/api/v1/tenders/' + encodeURIComponent(tenderId) + '/rule-sets');
      setRuleSets(response.items); setActiveRuleSetId(response.active_rule_set_id || '');
      setNotice('Approved. This version is active; the previous approved version is retained as superseded.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not approve rule set.'); }
    finally { setBusy(false); }
  }

  async function evaluate() {
    if (!tenderId || !selectedRuleSet) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const evidence = JSON.parse(evidenceText) as Record<string, unknown>;
      const result = await apiRequest<Record<string, unknown>>('/api/v1/tenders/' + encodeURIComponent(tenderId) + '/rule-sets/' + encodeURIComponent(selectedRuleSet.id) + '/evaluate', { method: 'POST', body: JSON.stringify({ evidence }) });
      setResultText(pretty(result));
    } catch (e) { setError(e instanceof Error ? e.message : 'Evaluation failed. Check the evidence JSON.'); }
    finally { setBusy(false); }
  }

  const isEditable = !selectedRuleSet || selectedRuleSet.status === 'draft';
  return <main className="rule-builder">
    <header className="rule-header"><div><p className="eyebrow">NIRNAY / CONFIGURATION</p><h1>Tender rule builder</h1><p className="rule-muted">Create versioned rules from each tender. Drafts require reviewer approval before bidder evaluation.</p></div><button className="rule-button secondary" onClick={() => void refresh()} disabled={busy || !tenderId}><RefreshCw size={16}/> Refresh</button></header>
    {error && <div className="rule-alert error" role="alert">{error}</div>}{notice && <div className="rule-alert success" role="status">{notice}</div>}
    <section className="rule-panel rule-toolbar">
      <label>Choose tender<select value={tenderId} onChange={e => { const value = e.target.value; setTenderId(value); setResultText(''); if (!value) { setRuleSets([]); setActiveRuleSetId(''); } }}><option value="">Select a tender</option>{tenders.map(tender => <option key={tender.id} value={tender.id}>{tender.tender_number} — {tender.title}</option>)}</select></label>
      <label>Rule-set version<select value={activeRuleSetId} onChange={e => setActiveRuleSetId(e.target.value)}><option value="">New draft</option>{ruleSets.map(item => <option key={item.id} value={item.id}>v{item.version} · {item.status} · {item.name}</option>)}</select></label>
      <div className="rule-toolbar-actions"><button className="rule-button secondary" disabled={!selectedRuleSet} onClick={loadSelected}>Load selected</button><button className="rule-button secondary" disabled={!selectedRuleSet || selectedRuleSet.status !== 'draft' || busy} onClick={() => { if (!selectedRuleSet) return; setRulesText(pretty([...selectedRuleSet.rules, blankRule(selectedRuleSet.rules.length + 1)])); }}><Plus size={16}/> Add rule</button></div>
    </section>
    {!selectedTender && <section className="rule-panel"><p className="rule-muted">No tenders are available to configure. Create a tender first, then return here.</p></section>}
    {selectedTender && <>
      <section className="rule-panel"><div className="rule-section-heading"><div><h2>Rule-set details</h2><p className="rule-muted">Source references should point to a page or clause in the original tender.</p></div><span className={'rule-status ' + (selectedRuleSet?.status || 'draft')}>{selectedRuleSet?.status || 'new draft'}</span></div>
        <div className="rule-fields"><label>Rule-set name<input value={name} onChange={e => setName(e.target.value)} disabled={!isEditable}/></label><label>Change summary<input value={changeSummary} onChange={e => setChangeSummary(e.target.value)} placeholder="e.g. Initial rules extracted from tender pages 3–4" disabled={!isEditable}/></label></div>
        <label className="rule-editor-label"><span><FileJson2 size={17}/> Rule definitions (JSON)</span><textarea spellCheck={false} value={rulesText} onChange={e => setRulesText(e.target.value)} rows={18} disabled={!isEditable}/></label>
        <p className="rule-muted">Supported types: numeric_threshold, document_presence, value_match, alternative_group. Conditions support ==, !=, in, not_in, contains. Rule JSON is validated server-side; executable expressions are not supported.</p>
        <div className="rule-actions"><button className="rule-button secondary" onClick={() => { setName("Electrical panel tender rules"); setChangeSummary("Draft seeded from the supplied tender: eligibility criteria on page 3 and checklist on page 4. Verify every rule against the complete tender and corrigenda."); setRulesText(pretty(electricalPanelTenderRules)); }} disabled={busy || !isEditable}>Load electrical-panel example</button><button className="rule-button primary" onClick={() => void saveDraft()} disabled={busy || !isEditable}><Save size={16}/> Save new version</button><button className="rule-button primary" onClick={() => void approve()} disabled={busy || selectedRuleSet?.status !== 'draft'}><CheckCircle2 size={16}/> Approve rule set</button></div>
      </section>
      <section className="rule-panel"><div className="rule-section-heading"><div><h2>Try the evaluator</h2><p className="rule-muted">Supply structured evidence facts. This is a sandbox; no bidder document is modified.</p></div><ShieldCheck size={21}/></div><label className="rule-editor-label"><span>Evidence payload (JSON)</span><textarea spellCheck={false} value={evidenceText} onChange={e => setEvidenceText(e.target.value)} rows={7}/></label><button className="rule-button secondary" onClick={() => void evaluate()} disabled={busy || !selectedRuleSet}><CheckCircle2 size={16}/> Evaluate selected rule set</button>{resultText && <pre className="rule-result" aria-live="polite">{resultText}</pre>}</section>
    </>}
    <section className="rule-panel"><h2>Version history</h2>{ruleSets.length === 0 ? <p className="rule-muted">No rule-set versions saved for this tender yet.</p> : <div className="rule-history">{ruleSets.map(item => <button key={item.id} className="rule-history-item" onClick={() => { setActiveRuleSetId(item.id); setName(item.name); setChangeSummary(item.changeSummary || ''); setRulesText(pretty(item.rules)); setResultText(''); }}><strong>Version {item.version}: {item.name}</strong><span className={'rule-status ' + item.status}>{item.status}</span><small>{item.rules.length} rules · {item.changeSummary || 'No change summary'}</small></button>)}</div>}</section>
    <p className="rule-disclaimer">Screening is an assistive evidence workflow, not a legal determination. Missing or ambiguous evidence should be escalated for human review.</p>
  </main>;
}
