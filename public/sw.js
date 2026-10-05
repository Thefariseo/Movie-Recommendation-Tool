// Umbrify's service worker: it makes the site installable as an app and shows
// the notifications a member turned on. It caches nothing, so every visit
// gets the current site.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'Umbrify', body: event.data?.text() || '' }; }
  event.waitUntil(self.registration.showNotification(data.title || 'Umbrify', {
    body: data.body || '',
    icon: '/web-app-manifest-192x192.png',
    badge: '/favicon-96x96.png',
    tag: data.tag || undefined,
    data: { link: typeof data.link === 'string' && data.link.startsWith('/') ? data.link : '/' }
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.link || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const tab = open.find((c) => new URL(c.url).origin === self.location.origin);
    if (tab) { await tab.focus(); return tab.navigate(url).catch(() => null); }
    return self.clients.openWindow(url);
  })());
});
