# NIRNAY Firebase integration

This branch retains FastAPI and adds Firebase Authentication, Firestore, private Storage uploads, Firebase Cloud Messaging, and Firebase Hosting.

## Architecture
- React + Vite is served by Firebase Hosting.
- Firebase Authentication handles email/password registration and login.
- Browser requests include Firebase ID tokens as Authorization: Bearer.
- FastAPI verifies tokens with Firebase Admin and scopes private records/files to the UID in the verified token.
- Firestore stores profile metadata, saved records, document metadata and FCM Firebase Installation IDs under users/{uid}.
- Cloud Storage keeps documents under users/{uid}/documents/...
- Hosting rewrites /api/** to Cloud Run service nirnay-api in asia-south1.
- Original demo tender endpoint stays; generic records are scaffolding, not the final tender data model.

## Firebase setup
1. Create/select a project at https://console.firebase.google.com/.
2. Add a Web App in Project settings → General → Your apps and copy its config.
3. Authentication → Sign-in method: enable Email/Password.
4. Create a Firestore database in production mode.
5. Enable Storage and create a bucket; record exact bucket name.
6. Project settings → Cloud Messaging: obtain the Web Push public VAPID key.
7. Never put Admin SDK private keys in frontend files or Git.

## Frontend setup
Copy frontend/.env.example to frontend/.env.local. Fill in the config values and VAPID key. Update the same public Web App values in frontend/public/firebase-messaging-sw.js. Leave VITE_API_BASE_URL blank for the local Vite proxy and production Hosting rewrite. Run npm install from frontend to install Firebase and regenerate package-lock.json, then npm run dev and npm run build.

## Backend local setup
From backend/, create a venv, install requirements, and copy .env.example to .env. Set FIREBASE_PROJECT_ID and FIREBASE_STORAGE_BUCKET. For local development, create an Admin SDK service-account key outside Git and set GOOGLE_APPLICATION_CREDENTIALS to its local path. On Cloud Run use Application Default Credentials from the attached service identity.
Run: uvicorn app.main:app --reload --env-file .env --host 127.0.0.1 --port 8000

## API routes
- GET /api/v1/auth/me — sync authenticated profile.
- GET/POST /api/v1/records and PATCH/DELETE /api/v1/records/{record_id} — user-scoped Firestore records.
- GET/POST /api/v1/documents, GET /api/v1/documents/{id}/download, DELETE /api/v1/documents/{id} — private file routes (15 MiB max; PDF, PNG/JPG, DOCX, XLSX, TXT).
- POST/DELETE /api/v1/notifications/register — store/remove the signed-in browser FCM Firebase Installation ID.
- POST /api/v1/notifications/test — disabled unless ENABLE_TEST_NOTIFICATIONS=true.
- Existing GET /api/v1/tenders/demo route remains.

For real alerts call send_user_notification(uid, title, body, data) from trusted backend workflows. Never accept arbitrary recipient UIDs from client input.

## Hosting / Cloud Run
Hosting and Docker target service nirnay-api in asia-south1. Enable the required APIs, review quotas/pricing and use a billing-enabled project. Give the Cloud Run service identity only needed permissions for Firestore, Storage and FCM.
Example:
    gcloud config set project YOUR_PROJECT_ID
    gcloud run deploy nirnay-api --source backend --region asia-south1 --allow-unauthenticated --set-env-vars FIREBASE_PROJECT_ID=YOUR_PROJECT_ID,FIREBASE_STORAGE_BUCKET=YOUR_BUCKET,FRONTEND_ORIGINS=https://YOUR_PROJECT_ID.web.app,ENABLE_TEST_NOTIFICATIONS=false
The service is public for Hosting routing, but private endpoints verify tokens and enforce UID ownership.
Deploy:
    cd frontend
    npm install
    npm run build
    cd ..
    cp .firebaserc.example .firebaserc
    # Edit .firebaserc with your project ID.
    firebase deploy --only hosting,firestore:rules,storage

## Production checklist
- Firebase UID establishes identity, not procurement role. Add role/tenant access controls before exposing tender and bidder information.
- Firestore and Storage rules deny client access; Admin SDK bypasses them, so backend authorization is essential.
- File extension allow-list is not malware scanning. Add content-signature validation, scanning, retention and audit trails before production procurement documents.
- Web push needs HTTPS outside localhost and user permission.
- Keep test notifications disabled in production.
- Test invalid/revoked ID tokens, cross-user access, file authorization, FID changes, Hosting rewrites, and CORS before go-live.