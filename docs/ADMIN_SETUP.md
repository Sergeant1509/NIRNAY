# NIRNAY administrator setup

## How admin authorization works

NIRNAY treats Firebase Authentication custom claims as the source of truth for privileged roles. The backend checks the `role` claim from a verified Firebase ID token for every `/api/v1/admin/*` request. A role value stored in a user-editable Firestore profile is not sufficient to grant access.

Supported roles: `user`, `reviewer`, `admin`. The current admin API manages users and audit events; tender counts are informational until tender data is persisted in the `tenders` collection.

## Provision the first administrator

There is intentionally no public bootstrap endpoint. Provision the first administrator from a trusted machine that has Firebase Admin credentials and permission to update Firebase Authentication users.

Run from the `backend/` directory after configuring `FIREBASE_PROJECT_ID` and Application Default Credentials (or `GOOGLE_APPLICATION_CREDENTIALS`):

```bash
python -c "from firebase_admin import auth; from app.core.firebase import get_firebase_app; uid = input('Exact Firebase UID to promote: ').strip(); user = auth.get_user(uid, app=get_firebase_app()); claims = dict(user.custom_claims or {}); claims['role'] = 'admin'; auth.set_custom_user_claims(uid, claims, app=get_firebase_app()); print('Admin claim set for', uid)"
```

Only run this for a UID you have independently verified in Firebase Authentication. Do not put service-account keys in Git, frontend environment variables, or a public web form. Revoke the temporary credentials after provisioning where appropriate.

The user must sign out and sign back in, or force-refresh their Firebase ID token, before the new claim appears. Verify access by calling `GET /api/v1/admin/overview` with that user's fresh ID token. A normal user should receive HTTP 403.

## Environment

Copy `backend/.env.example` to a local backend environment file and configure the required Firebase and Cloudinary values. Cloudinary credentials are server-only. Never use Firebase Storage credentials or Cloudinary API secrets in `VITE_*` variables.

## Limitations to address before production

- The dashboard only lists the first 50 user profiles; pagination is a follow-up task.
- User suspension, tender CRUD, compliance decisions, and document review workflows are not implemented by this initial admin panel.
- Firestore collections must be monitored for orphaned Cloudinary assets after partial failures.
- Keep audit log access restricted to administrators and define retention requirements.
- Deploy the API with a least-privilege service identity, non-root container user, TLS, request limits, and monitored error reporting.
