// Самоуничтожающийся service worker (ADR-0032): раньше по этому адресу жил
// Workbox-worker с прекешем оболочки. Без файла по старому адресу браузер
// продолжает отдавать закешированную старую версию, пока сам не снимет
// регистрацию — на iOS это может занять сутки. Этот worker при установке
// сразу перехватывает управление, стирает все кеши, снимает регистрацию и
// перезагружает открытые вкладки. Удалить файл можно не раньше чем через
// три месяца после выкладки — за это время все активные пользователи его
// получат.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) client.navigate(client.url);
    })(),
  );
});
