self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {
    data = { title: 'VML FEED', body: event.data ? event.data.text() : 'Posting baru' };
  }
  const title = data.title || 'VML FEED — POST BARU';
  const options = {
    body: data.body || 'Ada posting baru di VML Feed.',
    icon: data.icon || '/favicon.ico',
    badge: data.badge || '/favicon.ico',
    tag: data.tag || ('vml-feed-' + (data.postId || Date.now())),
    renotify: true,
    data: { url: data.url || '/', postId: data.postId || '' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification.data?.url || '/';
  event.waitUntil((async () => {
    const list = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of list) {
      try {
        if ('focus' in client) {
          await client.navigate(target);
          return client.focus();
        }
      } catch (_) {}
    }
    if (clients.openWindow) return clients.openWindow(target);
  })());
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
