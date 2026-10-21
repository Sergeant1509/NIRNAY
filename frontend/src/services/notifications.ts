import { getMessaging, getToken, isSupported, onMessage, type MessagePayload } from 'firebase/messaging';
import { firebaseApp } from '../lib/firebase';
import { apiRequest } from '../lib/api';

function messagingWorkerUrl() {
  if (!firebaseApp) throw new Error('Firebase is not configured.');
  const config = firebaseApp.options;
  const params = new URLSearchParams({
    apiKey: config.apiKey || '',
    authDomain: config.authDomain || '',
    projectId: config.projectId || '',
    storageBucket: config.storageBucket || '',
    messagingSenderId: config.messagingSenderId || '',
    appId: config.appId || '',
  });
  return '/firebase-messaging-sw.js?' + params.toString();
}

async function getMessagingServiceWorker() {
  const sw = await navigator.serviceWorker.register(messagingWorkerUrl());
  await navigator.serviceWorker.ready;
  return sw;
}

async function saveRegistrationToken(token: string) {
  await apiRequest<{ ok: boolean }>('/api/v1/notifications/register', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export async function enablePushNotifications() {
  if (!firebaseApp) throw new Error('Firebase is not configured.');
  if (!('serviceWorker' in navigator) || !('Notification' in window)) {
    throw new Error('This browser does not support push notifications.');
  }
  if (!(await isSupported())) throw new Error('Firebase Messaging is not supported in this browser.');
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;
  if (!vapidKey) throw new Error('Add VITE_FIREBASE_VAPID_KEY from Firebase Console → Cloud Messaging → Web Push certificates.');
  if (await Notification.requestPermission() !== 'granted') throw new Error('Notification permission was not granted.');
  const sw = await getMessagingServiceWorker();
  const token = await getToken(getMessaging(firebaseApp), {
    vapidKey,
    serviceWorkerRegistration: sw,
  });
  if (!token) throw new Error('Firebase did not return a notification registration token. Check Cloud Messaging configuration.');
  await saveRegistrationToken(token);
}

export async function resumePushNotificationsIfAllowed() {
  if (!firebaseApp || !('serviceWorker' in navigator) || !('Notification' in window)) return;
  if (Notification.permission !== 'granted' || !(await isSupported())) return;
  const key = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;
  if (!key) return;
  const token = await getToken(getMessaging(firebaseApp), {
    vapidKey: key,
    serviceWorkerRegistration: await getMessagingServiceWorker(),
  });
  if (token) await saveRegistrationToken(token);
}

export async function listenForForegroundNotifications(callback: (payload: MessagePayload) => void) {
  if (!firebaseApp || !(await isSupported())) return () => undefined;
  return onMessage(getMessaging(firebaseApp), callback);
}
