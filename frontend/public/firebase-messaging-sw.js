/* Firebase Web App config is public client configuration. Never put a service-account key here. */
importScripts('https://www.gstatic.com/firebasejs/13.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/13.0.0/firebase-messaging-compat.js');

const params = new URL(self.location.href).searchParams;
const config = {
  apiKey: params.get('apiKey') || '',
  authDomain: params.get('authDomain') || '',
  projectId: params.get('projectId') || '',
  storageBucket: params.get('storageBucket') || '',
  messagingSenderId: params.get('messagingSenderId') || '',
  appId: params.get('appId') || '',
};

if (!config.apiKey || !config.projectId || !config.messagingSenderId || !config.appId) {
  console.error('NIRNAY Firebase Messaging service worker is missing Firebase Web App configuration.');
} else {
  firebase.initializeApp(config);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage(payload => {
    self.registration.showNotification(payload.notification?.title || 'NIRNAY update', {
      body: payload.notification?.body || 'You have a new update.',
      data: payload.data || {},
      icon: '/favicon.svg',
    });
  });
}

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification?.data?.url || '/app';
  event.waitUntil(clients.openWindow(target));
});
