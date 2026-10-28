# Tender and application workflow (MVP)

## What this branch adds

- Persisted tender creation, listing, detail retrieval, and status changes in Firestore.
- Tender creation and status changes are restricted to Firebase custom-claim roles `reviewer` and `admin`.
- Public-to-authenticated-bidders listing is limited to tenders with status `open`; drafts and closed tenders are hidden from bidder accounts.
- Application intake linked to an open tender and to document IDs owned by the authenticated bidder.
- Bidder-scoped application listing and detail access; reviewers/admins can inspect application details.
- A preliminary screening run that extracts readable text from selected private PDF, image, DOCX, XLSX, and TXT evidence files, compares expected-evidence phrases with the extracted text, and persists findings under `verificationRuns/{runId}`.
- Audit events for tender creation/status changes, in addition to existing user-role audit events.
- A React page at `/tenders`, linked from the user workspace, for publishing tenders, selecting uploaded evidence, submitting applications, and viewing screening findings.

## API

- `GET /api/v1/tenders` — list persisted tenders (open only for bidder accounts).
- `POST /api/v1/tenders` — reviewer/admin creates a tender.
- `GET /api/v1/tenders/{tender_id}` — fetch a tender subject to status/role checks.
- `PATCH /api/v1/tenders/{tender_id}/status` — reviewer/admin changes status.
- `POST /api/v1/applications` — authenticated bidder submits an application with their own document IDs.
- `GET /api/v1/applications` — list the current bidder's applications.
- `GET /api/v1/applications/{application_id}` — read an owned application or one as reviewer/admin.
- `POST /api/v1/applications/{application_id}/evaluate` — create a persisted preliminary screening run.

## Important limitations

The current screening version (`document_content_phrase_screening_v1`) uses text extraction and phrase matching as a preliminary evidence-finding aid. It can OCR scanned PDFs/images when Tesseract is installed, read DOCX/XLSX/TXT files, and reports which expected phrases were found. A phrase match is always `needs_review`, never an automatic pass. Unreadable documents cause review status rather than being silently treated as missing. It does not determine whether values meet a threshold, whether a certificate is valid/current/authentic, whether a signature is genuine, or whether legal compliance is established. A human reviewer must inspect original files before deciding compliance.

The frontend's tender creation form supports one requirement per line in this format:

`Title | Description | CATEGORY | evidence phrase, evidence phrase`

Firestore query/index requirements may vary with existing project configuration. The first test should be against a development Firebase project, not production data.

## Manual test plan

1. Sign in as an admin or reviewer and publish a draft/open tender with at least one mandatory requirement.
2. Confirm the tender appears in `GET /api/v1/tenders` for a bidder only after it is open.
3. Sign in as a normal user and attempt to create a tender; expect `403`.
4. Upload a sample document in the bidder's workspace and submit an application using that document.
5. Try submitting a document ID owned by another user; expect `400`.
6. Run preliminary screening and verify findings include matched evidence phrases, document counts, and the limitation disclaimer.
7. Test a text-based PDF, scanned PDF, image, DOCX, XLSX, and TXT file; include a deliberately unreadable or unsupported file and confirm the result asks for review rather than claiming compliance.
8. Check the admin audit panel after tender creation/status change.
9. Confirm normal users cannot read other bidders' applications.
10. Run frontend lint/build and backend CI checks. Live Firebase/Cloudinary end-to-end tests still require a configured development environment.
