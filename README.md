# NIRNAY

NIRNAY is a procurement document intake and preliminary compliance evidence workspace. It helps reviewers organize tender requirements, bidder evidence, source references, and review outcomes. It is not a legal compliance decision system.

## Dynamic tender rules

The reviewer-only **Tender rule builder** creates versioned rule sets per tender. Rules are stored as structured data, can be reviewed before approval, and are evaluated by deterministic code. Approved versions remain identifiable; when a new version is approved, the previous version is retained as superseded. The engine supports numeric thresholds, document presence, accepted-value matching, and AND/OR alternative groups. See [Dynamic Tender Rule Engine](docs/DYNAMIC_RULE_ENGINE.md) for API examples, schema, and limitations.

The extraction layer can suggest clauses and fields from text PDFs, scanned PDFs, and images. Treat all extracted values and rule proposals as drafts. Reviewers must confirm every rule against the original tender and any corrigenda before approval.

## Local development

### Backend

From the repository root:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000/docs` for the API. Local development needs a configured Firebase Admin identity and environment variables; do not commit `.env` or service-account credentials. OCR for scanned documents requires the Tesseract engine installed on the host. On Windows, configure the executable path in the process environment or module configuration.

### Frontend

In a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Use the URL printed by Vite, typically `http://localhost:5173`. Configure `VITE_API_BASE_URL` in the local frontend environment when the API is not served from the same origin.

## Validation and limitations

Run backend tests with `python -m pytest -q`, and frontend checks with `npm run build` and `npm run lint`. Live Firebase/Cloudinary end-to-end tests require a configured development environment.

The rules engine evaluates structured evidence values; it does not independently authenticate documents, verify signatures or registry status, establish legal compliance, or automatically interpret every tender clause. All AI/OCR-extracted rules require reviewer approval, and ambiguous or missing evidence must remain under human review. Firebase Storage is not required; private document storage remains on the configured Cloudinary integration.
