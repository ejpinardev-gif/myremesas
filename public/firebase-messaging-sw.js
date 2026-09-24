importScripts('https://www.gstatic.com/firebasejs/11.6.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.6.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyCnXU8XU7ZzA_12CDaYaY9W2rWBmkGLB-g',
  authDomain: 'studio-7601782447-44d81.firebaseapp.com',
  projectId: 'studio-7601782447-44d81',
  storageBucket: 'studio-7601782447-44d81.firebasestorage.app',
  messagingSenderId: '775892034675',
  appId: '1:775892034675:web:98ed2724bcaff2ed427606',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const data = payload?.data || {};
  const title = data.title || 'My Remesas';
  const body = data.body || 'Tu orden se actualizó.';
  const url = data.url || '/?view=history';

  return self.registration.showNotification(title, {
    body,
    tag: data.transactionId ? `order-${data.transactionId}` : 'myremesas-order',
    renotify: true,
    data: { url },
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || '/?view=history';
  const target = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existingClient = clients.find((client) => client.url === target);
      if (existingClient) return existingClient.focus();
      return self.clients.openWindow(target);
    }),
  );
});
