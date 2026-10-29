# Prototype document verification

## Scope

This feature is a student prototype for document evidence screening. It does not connect to DigiLocker, EntityLocker, GST, MCA, PAN, banks, or any government/issuer registry. It does not establish that a file is genuine or unaltered.

## Endpoint

- GET /api/v1/document-verification/document-types
- POST /api/v1/document-verification/analyze

Both endpoints require a valid Firebase ID token. The analysis request is multipart/form-data with a document_type field and a file field. Supported formats: PDF, PNG, JPG/JPEG, DOCX, XLSX, TXT, up to 15 MiB.

The uploaded bytes are processed in the request and are not persisted by this endpoint. This is separate from the existing private document library, which stores files through the configured Cloudinary integration.

## Checks performed

- PDF text extraction and OCR fallback for scans/images (Tesseract required for OCR); DOCX/XLSX/TXT parsing.
- Heuristic extraction of PAN/GSTIN-shaped identifiers, possible registration number, possible legal/business name, explicit numeric amounts, and some validity-date text.
- Document-type-specific format/presence checks.
- Explicit not_checked results for issuer authenticity and digital signature/tamper verification.

A pass means only that a heuristic extraction/format check succeeded. It is not issuer verification. Manual review means a person needs to inspect the evidence. Do not present this endpoint's output as a verified certificate or automatic eligibility decision.

## Demo guidance

Use synthetic sample documents containing invented business data. Never use real PAN, GST, bank, or identity data in screenshots or demo fixtures. Keep a visible prototype/demo label in the UI and report. Later, a real integration must use an approved partner flow, user consent, official APIs, and a clear record of the source and timestamp of each verification.
