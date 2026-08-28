/* SahamLens Web Push service worker.
 * Intentionally does not cache application assets: its scope is notification delivery only.
 */

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : 'LensAlert terpicu.' };
  }

  const title = typeof payload.title === 'string' ? payload.title : 'SahamLens LensAlert';
  const body = typeof payload.body === 'string' ? payload.body : 'Alert riset Anda terpicu.';
  const url = typeof payload.url === 'string' ? payload.url : '/watchlist';
  const tag = typeof payload.tag === 'string' ? payload.tag : 'sahamlens-lensalert';
  const timestamp = typeof payload.timestamp === 'number' ? payload.timestamp : Date.now();

  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: '/icon-pwa-192.png?v=5',
    badge: '/icon-pwa-192.png?v=5',
    tag,
    renotify: true,
    timestamp,
    data: { url },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/watchlist', self.location.origin).toString();

  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('navigate' in client) {
        await client.navigate(targetUrl);
        return client.focus();
      }
    }
    return clients.openWindow(targetUrl);
  })());
});
