# NIRNAY — local development and Firebase setup

NIRNAY has a React + TypeScript + Vite frontend in frontend/ and a FastAPI backend in backend/. Firebase Authentication handles browser sign-in; the backend verifies Firebase ID tokens. Firestore stores user profiles, records, and document metadata. Firebase Storage stores uploaded file bytes only when Storage is enabled and the project plan supports it. Firebase Cloud Messaging provides optional browser notifications.

The backend in this branch uses Firestore, not PostgreSQL. Existing PostgreSQL data is not migrated automatically.

## 1. Firebase Console setup

1. Select your Firebase project.
2. In Authentication → Sign-in method, enable Email/Password.
3. Create a Cloud Firestore database using Standard edition and Production mode.
4. Keep the repository's Firestore rules deployed. They deny direct browser reads and writes; the backend uses the Admin SDK after validating the Firebase ID token and checking the user UID.
5. Storage is optional for Firestore testing. As of 2026, Firebase Storage setup for new projects may require the Blaze pay-as-you-go plan. If you stay on Spark/free, the document upload/download endpoints will not work until you configure another storage provider.

## 2. Configure the frontend

From PowerShell at the repository root:

    Copy-Item frontend/.env.example frontend/.env.local
    notepad frontend/.env.local

Fill in the values from Firebase Console → Project settings → General → Your apps:

    VITE_FIREBASE_API_KEY=your-web-api-key
    VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
    VITE_FIREBASE_PROJECT_ID=your-project-id
    VITE_FIREBASE_STORAGE_BUCKET=your-actual-storage-bucket
    VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
    VITE_FIREBASE_APP_ID=your-web-app-id
    VITE_FIREBASE_VAPID_KEY=your-web-push-public-vapid-key
    VITE_API_BASE_URL=

The VAPID key is only needed for push notifications. Never put a service-account private key in a VITE variable.

## 3. Configure the backend

In Firebase Console → Project settings → Service accounts, generate a private key for local development. Save the downloaded JSON file as backend/service-account.json. Never commit or share it.

From the repository root, create the backend environment file:

    Copy-Item backend/.env.example backend/.env
    notepad backend/.env

Set these values:

    FIREBASE_PROJECT_ID=your-project-id
    FIREBASE_STORAGE_BUCKET=your-actual-storage-bucket
    GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
    FRONTEND_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
    ENABLE_TEST_NOTIFICATIONS=false

Use the exact project ID and bucket name from Firebase Console. Storage bucket configuration is only required for uploads/downloads. Start Uvicorn from backend/ so the relative service-account path resolves.

Admin SDK requests bypass Firestore Security Rules. The API must therefore verify ID tokens and scope each user-owned operation to the verified UID. Do not remove these checks or deploy permissive rules.

## 4. Firestore data layout

The backend creates documents automatically; you do not need to create collections manually.

- users/{firebase_uid}: user profile.
- users/{firebase_uid}/records/{record_id}: user records.
- users/{firebase_uid}/documents/{document_id}: file metadata.
- users/{firebase_uid}/fcmInstallations/{installation_id}: notification installation metadata.

Existing PostgreSQL data is not automatically copied to Firestore.

## 5. Run the backend

Open PowerShell at the repository root:

    cd backend
    py -m venv venv
    .\venv\Scripts\Activate.ps1
    python -m pip install --upgrade pip
    pip install -r requirements.txt
    uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

If PowerShell blocks activation, run this in that terminal and activate again:

    Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
    .\venv\Scripts\Activate.ps1

If you already have a virtual environment, activate it instead of creating another one.

## 6. Run the frontend

Open a second PowerShell terminal at the repository root:

    cd frontend
    npm install
    npm run lint
    npm run build
    npm run dev

Open http://localhost:5173. Backend health is available at http://127.0.0.1:8000/healthz and API docs at http://127.0.0.1:8000/docs.

## 7. Test the integration

1. Register and sign in at http://localhost:5173/register.
2. Save a test record.
3. Open Firebase Console → Firestore → Data and verify a profile under users and the record under users/{firebase_uid}/records.
4. Test file uploads only if Firebase Storage is enabled and configured.
5. Test with two accounts to confirm that one user cannot access another user's records.
6. Run npm run lint and npm run build in frontend/ before deployment.

## 8. Optional push notifications

Configure Cloud Messaging and the public Web Push VAPID key, then set VITE_FIREBASE_VAPID_KEY in frontend/.env.local. Restart Vite after changing environment variables. Push notifications are optional for testing Authentication and Firestore records.
