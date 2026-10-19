# NIRNAY — local development and Firebase setup

NIRNAY has a React + TypeScript + Vite frontend in `frontend/` and a FastAPI backend in `backend/`. Firebase Authentication handles browser sign-in; the backend verifies Firebase ID tokens with Firebase Admin. Firestore stores per-user records and metadata, Firebase Storage stores private document objects, and Firebase Cloud Messaging provides browser notifications.

## Requirements

- Git
- Node.js LTS with npm
- Python 3.11 or newer (use the version supported by your local deployment)
- A Firebase project with billing enabled where required by the Firebase products you use

## 1. Clone and install

From PowerShell:

```powershell
git clone https://github.com/ayushgupta09094-bugslayer/NIRNAY.git
cd NIRNAY

cd frontend
npm install
cd ..
```

## 2. Configure Firebase Web App

1. Open the Firebase Console and create/select your project.
2. In Project settings → General → Your apps, add a Web app and copy its Firebase config.
3. In Authentication → Sign-in method, enable **Email/Password**.
4. In Authentication → Settings → Authorized domains, make sure `localhost` is allowed for local development.
5. Copy the frontend environment template:

   ```powershell
   Copy-Item frontend/.env.example frontend/.env.local
   ```

6. Open `frontend/.env.local` and replace the placeholder values with the Web App values:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`

For notifications, open Firebase Console → Cloud Messaging → Web configuration / Web Push certificates. Generate or copy the **Web Push public VAPID key** and set `VITE_FIREBASE_VAPID_KEY` to that value.

Firebase Web App configuration and the VAPID public key are client-side values, not service-account secrets. Never put a service-account JSON key or private key in a `VITE_*` variable or commit it.

## 3. Enable Firestore and Storage

1. Firebase Console → Firestore Database → Create database.
2. Firebase Console → Storage → Get started.
3. Keep the repository's Firestore and Storage rules deployed. They deny direct browser access; the FastAPI backend accesses data after verifying the signed-in user's Firebase ID token and scopes records to that UID.

## 4. Configure Firebase Admin for the backend

Create a service account in Firebase Console → Project settings → Service accounts → Generate new private key. Store the downloaded JSON locally at `backend/service-account.json`; never commit it.

Create the backend environment:

```powershell
Copy-Item backend/.env.example backend/.env
```

Edit `backend/.env` and set the same project ID and storage bucket:

```dotenv
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_STORAGE_BUCKET=your-project-id.firebasestorage.app
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
FRONTEND_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
ENABLE_TEST_NOTIFICATIONS=false
```

Use the actual bucket name displayed in Firebase Console → Storage. Some older projects use a `.appspot.com` bucket. Because the credential path above is relative to the backend working directory, launch Uvicorn from `backend/`.

Install and start the backend (PowerShell):

```powershell
cd backend
py -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env -ErrorAction SilentlyContinue
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

If PowerShell prevents venv activation, use this for the current terminal only, then activate again:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\venv\Scripts\Activate.ps1
```

Open a second terminal to continue with the frontend.

## 5. Start the frontend

In a new PowerShell terminal, from the repository root:

```powershell
cd frontend
npm install
npm run lint
npm run build
npm run dev
```

Vite usually serves the frontend at http://localhost:5173. The development proxy forwards `/api` to `http://127.0.0.1:8000`. To use another backend URL, set `VITE_DEV_API_TARGET` before starting Vite.

Check backend health at http://127.0.0.1:8000/healthz and API documentation at http://127.0.0.1:8000/docs.

## 6. Test the complete local flow

1. Open http://localhost:5173/register and create a test account.
2. Sign in, then confirm the dashboard loads.
3. Save a test record. Check Firestore under `users/{firebase-uid}/records` (or the collection path used by the records API).
4. Upload a small PDF/TXT test file. Verify its metadata in Firestore and its object in Storage.
5. Download and delete the test file; verify each action succeeds.
6. Run `npm run lint` and `npm run build` from `frontend/` after code changes.

If the browser gets a 401, sign out and back in; confirm the backend is using the correct Firebase project/service account. If the backend returns 503, inspect its terminal for Admin SDK credential, project ID, Firestore, or bucket configuration errors.

## 7. Enable push notifications (optional)

1. Use `http://localhost:5173` or HTTPS; browser push generally will not work on arbitrary insecure origins.
2. In Firebase Console → Cloud Messaging, ensure Cloud Messaging is available and configure the Web Push VAPID public key.
3. Set `VITE_FIREBASE_VAPID_KEY` in `frontend/.env.local`, then restart Vite.
4. Sign in and click **Enable notifications** on the dashboard; grant the browser permission.
5. If testing backend-generated notifications, set `ENABLE_TEST_NOTIFICATIONS=true` in `backend/.env` temporarily, restart the backend, and call the authenticated `POST /api/v1/notifications/test` endpoint (for example using the browser's signed-in session or an API tool with a Firebase ID token). Turn the flag off afterward.

The service worker receives the Web App's public config via its registration URL. Do not expose the Firebase Admin service-account key to the browser. Clear or unregister an old service worker in browser DevTools → Application → Service Workers if a stale worker continues using old settings.

## 8. Common commands

From repository root:

```powershell
# Update the checkout safely
git switch main
git pull --ff-only origin main

# Frontend checks
cd frontend
npm install
npm run lint
npm run build
npm run dev
```

Run the backend in a separate terminal as shown above. Do not use `git reset --hard` to fix a pull conflict if you have uncommitted changes; stash or commit your work first.
