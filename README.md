# NIRNAY — local development and Firebase setup

NIRNAY uses React + TypeScript + Vite in `frontend/` and FastAPI in `backend/`. Firebase Authentication handles sign-in, Firebase Admin verifies ID tokens, and Cloud Firestore stores application profiles and user records. Push notifications are optional. File uploads use Firebase Storage only when the project has Storage enabled and the selected plan supports it.

This branch uses **Firestore, not PostgreSQL**. Existing PostgreSQL data is not automatically migrated to Firestore.

## 1. Firebase Console setup

1. Open [Firebase Console](https://console.firebase.google.com/) and select your project.
2. Go to **Build → Authentication → Sign-in method** and enable **Email/Password**.
3. In **Authentication → Settings → Authorized domains**, ensure `localhost` is listed for local testing.
4. Open **Build → Firestore Database** and create a database (Standard edition; Production mode is fine).
5. Keep the restrictive `firestore.rules` in this repository deployed. Browser reads/writes are denied; the FastAPI backend verifies the Firebase ID token and scopes requests to the authenticated UID.
6. Register a **Web app** under **Project settings → General → Your apps** if not already done. Copy the Web App config.
7. Storage is optional for checking auth and Firestore records. File uploads/downloads require a working Storage bucket; Firebase Storage availability and billing requirements depend on the project/account. Do not enable billing unless you have decided to use a paid plan.

## 2. Configure frontend Firebase values

From PowerShell in the repository root:

```powershell
Copy-Item frontend/.env.example frontend/.env.local
notepad frontend/.env.local
```

Replace the placeholders using **Project settings → General → Your apps → SDK setup and configuration**:

```dotenv
VITE_FIREBASE_API_KEY=your-web-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-real-bucket-name
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-web-app-id
VITE_FIREBASE_VAPID_KEY=your-web-push-public-vapid-key
VITE_API_BASE_URL=
```

- `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, and `VITE_FIREBASE_APP_ID` come from Web App config.
- `VITE_FIREBASE_STORAGE_BUCKET` must be copied exactly from Firebase Console; do not guess the suffix.
- `VITE_FIREBASE_VAPID_KEY` is only needed for web push: **Project settings → Cloud Messaging → Web Push certificates**.
- Keep `VITE_API_BASE_URL=` blank for local Vite proxying.
- Never put a Firebase Admin service-account private key in any `VITE_*` setting.

## 3. Configure Firebase Admin for the backend

1. Open **Project settings → Service accounts** and generate a private key for local development.
2. Save the downloaded JSON at `backend/service-account.json`.
3. Create the backend environment file:

```powershell
Copy-Item backend/.env.example backend/.env
notepad backend/.env
```

Set these values:

```dotenv
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_STORAGE_BUCKET=your-real-bucket-name
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
FRONTEND_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
ENABLE_TEST_NOTIFICATIONS=false
```

Use the exact same project ID as the frontend. Bucket configuration is only needed for file storage. The credential path is relative to the backend working directory, so start Uvicorn from `backend/`. **Never commit or share `service-account.json` or `.env` files.**

## 4. Firestore data layout

You do not need to create the app collections manually. The backend writes records when the app is used:

- `users/{firebase_uid}` — user profile.
- `users/{firebase_uid}/records/{record_id}` — saved records.
- `users/{firebase_uid}/documents/{document_id}` — document metadata (requires Storage for actual file bytes).
- `users/{firebase_uid}/fcmInstallations/{installation_id}` — notification registration tokens.

The Firebase Admin SDK bypasses Firestore Security Rules, so the backend must continue verifying ID tokens and scoping operations to the verified UID. Do not replace the rules with public read/write access.

## 5. Run the backend (PowerShell terminal 1)

Open PowerShell at the repository root, then run:

```powershell
cd backend
py -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

If PowerShell blocks environment activation, run this in the same terminal, then activate again:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\venv\Scripts\Activate.ps1
```

If you already made a virtual environment, activate it instead of creating another one.

## 6. Run the frontend (PowerShell terminal 2)

Open a second terminal at the repository root:

```powershell
cd frontend
npm install
npm run lint
npm run build
npm run dev
```

Open `http://localhost:5173`. Backend health: `http://127.0.0.1:8000/healthz`. API docs: `http://127.0.0.1:8000/docs`.

## 7. Test before merging/deploying

1. Visit `http://localhost:5173/register`, create a test account, and sign in.
2. Save a test record.
3. In Firebase Console → Firestore → Data, verify a user profile and record under `users/{firebase_uid}/records`.
4. Create a second test account and confirm it cannot see the first account's records.
5. Run `npm run lint` and `npm run build` from `frontend/` and ensure both succeed.
6. Upload/download testing is separate and only works after Storage is configured and supported.

## 8. Optional browser notifications

1. Configure Cloud Messaging and the public Web Push VAPID key.
2. Set `VITE_FIREBASE_VAPID_KEY` in `frontend/.env.local` and restart Vite after changing environment variables.
3. Grant browser notification permission when prompted.
4. Leave `ENABLE_TEST_NOTIFICATIONS=false` except for a brief, deliberate test. Turn it off again afterward.

Auth and Firestore record testing do not require push notifications or Firebase Storage.
