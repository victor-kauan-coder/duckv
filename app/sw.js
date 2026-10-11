// Service worker: recebe os avisos enviados pelo computador e trata o toque neles.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    /* aviso sem conteudo */
  }
  const opts = {
    body: d.body || '',
    tag: d.tag || 'claudev',
    icon: '/icons/icone-192.png',
    badge: '/icons/selo-96.png',
    data: { url: d.url || '/', perm: d.perm || null },
    renotify: true,
  };
  if (d.perm) {
    opts.requireInteraction = true;
    opts.actions = [
      { action: 'allow', title: 'Aceitar' },
      { action: 'deny', title: 'Recusar' },
    ];
  }
  event.waitUntil(self.registration.showNotification(d.title || 'claudeV', opts));
});

async function abrir(url) {
  const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const j of janelas) {
    if ('focus' in j) {
      await j.focus();
      if ('navigate' in j) await j.navigate(url).catch(() => {});
      return;
    }
  }
  await self.clients.openWindow(url);
}

self.addEventListener('notificationclick', (event) => {
  const { url, perm } = event.notification.data || {};
  event.notification.close();
  if (perm && (event.action === 'allow' || event.action === 'deny')) {
    event.waitUntil(
      fetch('/api/verdict', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ instance: perm.instance, request_id: perm.request_id, behavior: event.action }),
      })
        .then((r) => {
          if (!r.ok) throw new Error('recusado');
        })
        .catch(() => abrir(url || '/')),
    );
    return;
  }
  event.waitUntil(abrir(url || '/'));
});
