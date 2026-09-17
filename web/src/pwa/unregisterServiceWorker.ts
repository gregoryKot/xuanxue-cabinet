// Снятие старого service worker (ADR-0032): кабинет больше не приложение
// с офлайн-оболочкой — push (этап 2) отменён владельцем, а тост обновления
// был единственной причиной регистрировать SW. У людей, открывавших кабинет
// раньше, worker уже стоит и может отдавать закешированную старую версию.
// web/public/sw.js — kill-switch по тому же адресу (снимает себя сам), этот
// модуль — вторая, независимая линия: снимает регистрации и чистит кеши прямо
// из кода приложения, не дожидаясь, пока браузер решит спросить у сервера
// новый sw.js.
export async function unregisterServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator) || !('caches' in globalThis)) return;

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));

    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys.map((key) => caches.delete(key)));
  } catch {
    // Приложение работает и без снятия SW — тихий отказ здесь не рискует
    // данными пользователя (в отличие от каналов рассылки, CLAUDE.md).
  }
}
