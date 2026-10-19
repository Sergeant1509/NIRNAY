/* Replace values with your Firebase Web App config. Never place a service-account key here. */
importScripts('https://www.gstatic.com/firebasejs/13.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/13.0.0/firebase-messaging-compat.js');
firebase.initializeApp({
  apiKey: 'replace-with-web-api-key',
  authDomain: 'your-project-id.firebaseapp.com',
  projectId: 'your-project-id',
  storageBucket: 'your-project-id.firebasestorage.app',
  messagingSenderId: 'replace-with-sender-id',
  appId: 'replace-with-web-app-id',
});
const messaging = firebase.messaging();
messaging.onBackgroundMessage(payload => {
  self.registration.showNotification(payload.notification?.title || 'NIRNAY update', {
    body: payload.notification?.body || 'You have a new update.',
    data: payload.data || {}, icon: '/favicon.svg',
  });
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification?.data?.url || '/app'));
});