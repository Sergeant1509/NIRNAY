import { getMessaging, isSupported, onMessage, onRegistered, onUnregistered, register, type MessagePayload } from 'firebase/messaging';
import { firebaseApp } from '../lib/firebase';
import { apiRequest } from '../lib/api';
let stopRegistered: (() => void) | undefined; let stopUnregistered: (() => void) | undefined;
async function registerPush(messaging: ReturnType<typeof getMessaging>, vapidKey: string, sw: ServiceWorkerRegistration) {
  stopRegistered?.(); stopUnregistered?.();
  let resolveFirst!: () => void; let rejectFirst!: (reason?: unknown) => void; let settled = false;
  const firstSaved = new Promise<void>((resolve, reject) => { resolveFirst = resolve; rejectFirst = reject; });
  stopRegistered = onRegistered(messaging, fid => {
    void apiRequest<{ ok: boolean }>('/api/v1/notifications/register', { method: 'POST', body: JSON.stringify({ fid }) })
      .then(() => { if (!settled) { settled = true; resolveFirst(); } })
      .catch(err => { if (!settled) { settled = true; rejectFirst(err); } });
  });
  stopUnregistered = onUnregistered(messaging, fid => {
    void apiRequest<{ ok: boolean }>('/api/v1/notifications/register', { method: 'DELETE', body: JSON.stringify({ fid }) }).catch(() => undefined);
  });
  let timer: number | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = window.setTimeout(() => reject(new Error('Notification registration timed out. Try again.')), 20000); });
  try {
    await register(messaging, { vapidKey, serviceWorkerRegistration: sw });
    await Promise.race([firstSaved, timeout]);
  } catch (err) { stopRegistered?.(); stopRegistered = undefined; stopUnregistered?.(); stopUnregistered = undefined; throw err; }
  finally { if (timer !== undefined) window.clearTimeout(timer); }
}
export async function enablePushNotifications() {
  if (!firebaseApp) throw new Error('Firebase is not configured.');
  if (!('serviceWorker' in navigator) || !('Notification' in window)) throw new Error('This browser does not support push notifications.');
  if (!(await isSupported())) throw new Error('Firebase Messaging is not supported in this browser.');
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;
  if (!vapidKey) throw new Error('Add VITE_FIREBASE_VAPID_KEY from Firebase Console → Cloud Messaging → Web Push certificates.');
  if (await Notification.requestPermission() !== 'granted') throw new Error('Notification permission was not granted.');
  const sw = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  await registerPush(getMessaging(firebaseApp), vapidKey, sw);
}
export async function resumePushNotificationsIfAllowed() {
  if (!firebaseApp || !('serviceWorker' in navigator) || !('Notification' in window)) return;
  if (Notification.permission !== 'granted' || !(await isSupported())) return;
  const key = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined; if (!key) return;
  await registerPush(getMessaging(firebaseApp), key, await navigator.serviceWorker.register('/firebase-messaging-sw.js'));
}
export async function listenForForegroundNotifications(callback: (payload: MessagePayload) => void) {
  if (!firebaseApp || !(await isSupported())) return () => undefined;
  return onMessage(getMessaging(firebaseApp), callback);
}