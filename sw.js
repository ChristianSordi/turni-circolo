// Mostra i promemoria dei turni che manda functions/index.js; toccandoli si apre il calendario.
self.addEventListener('push', (e) => {
  const { titolo, testo } = e.data.json();
  e.waitUntil(self.registration.showNotification(titolo, { body: testo, icon: 'icona.png', lang: 'it' }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window' }).then((f) => (f[0] ? f[0].focus() : clients.openWindow('./'))));
});
