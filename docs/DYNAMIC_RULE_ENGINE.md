# NIRNAY Dynamic Tender Rule Engine

## Purpose

Tender clauses vary by buyer, procurement category, amendment, and tender version. NIRNAY stores rules as validated structured data and evaluates them with deterministic code rather than embedding tender-specific thresholds in Python.

## Workflow

1. Upload and extract the tender and any corrigenda.
2. Treat extracted clauses and fields as untrusted draft suggestions; retain a source page/section reference and quote.
3. A reviewer edits the rule definitions and saves a draft version.
4. A reviewer approves a non-empty rule set. The previous approved version is retained as `superseded`; the tender points to the active rule-set ID.
5. Evaluate structured evidence against an approved version and preserve the rule-set ID/version with the result.
6. Human reviewers verify source documents, ambiguous extraction, signatures, authenticity, validity, and legal interpretation.

## Supported rule types

- `numeric_threshold`: numeric comparison against a named evidence field. Parameters: `field`, `operator` (`>=`, `>`, `<=`, `<`, `==`, `!=`), `value`.
- `document_presence`: looks for an exact, case-insensitive `document_type` in `evidence.documents`. Missing documents default to `needs_review`; use `missing_is_fail: true` only when a reviewer has explicitly configured that behavior.
- `value_match`: checks a field against a list of accepted values, case-insensitively.
- `alternative_group`: `parameters.alternatives` is a list of alternative routes; each route is a list of rules combined with AND, while routes are combined with OR. Nesting is limited.

All rules support `source_reference`, `required_evidence`, `condition`, `severity`, and optional extraction `confidence`. Unsupported rule types and missing numeric values never silently pass.

## API

- `GET /api/v1/tenders/{tender_id}/rule-sets`
- `POST /api/v1/tenders/{tender_id}/rule-sets` — reviewer/admin; creates a new draft version.
- `POST /api/v1/tenders/{tender_id}/rule-sets/{rule_set_id}/approve` — reviewer/admin; activates a draft.
- `POST /api/v1/tenders/{tender_id}/rule-sets/{rule_set_id}/evaluate` — evaluate a structured `evidence` object.

All endpoints require a Firebase ID token. Tender management/approval requires the verified token to include a reviewer or admin role. Rule sets are stored in Firestore collections `tender_rule_sets`; evaluations are recorded in `tender_rule_evaluations`; create/approve events are written to `admin_audit_logs`.

## Evidence payload example

```json
{
  "turnover_inr": 1400000,
  "documents": [
    {"document_type": "GST certificate"},
    {"document_type": "turnover certificate"}
  ]
}
```

Numeric evidence should already be normalized into a number and a declared unit/currency. Do not compare display strings such as `₹13.65 lakh` directly. This first implementation does not automatically extract trustworthy facts from bidder documents or infer legal logic. It evaluates structured evidence supplied to the endpoint. Integrating verified extraction and document provenance is a separate stage.

## Safety and versioning

Rule text is never executed as code. Drafts are not used for bidder evaluation unless the caller is a reviewer/admin in the sandbox; bidder-level evaluation requires an approved version. A newly approved version supersedes the prior approved version but preserves it for audit. Results include the exact rule-set ID and version. Human approval remains mandatory; the engine is not a legal compliance decision.
