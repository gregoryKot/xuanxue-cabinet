// Push-worker кабинета: service worker возвращается по тому же адресу
// `/sw.js`, где раньше жил самоуничтожающийся килсвитч (ADR-0032), и только
// ради push (ADR-0092). Обычный статический .js в web/public/ — Vite
// копирует его как есть, отдельной сборки (Workbox и подобное) не заводим:
// именно от Workbox с его прекешем в проекте отказались, заводить его снова
// ради пары обработчиков ниже незачем.
//
// Импортов нет и не будет: файл выполняется в контексте service worker
// (свой `self`, не `window` браузера) отдельно от сборки Vite — подключить
// сюда что-то из web/src нельзя. Строки ниже, которые в web/src уже есть
// своей константой, продублированы намеренно — комментарий рядом с каждой
// объясняет, почему иначе никак.
//
// Обработчика `fetch` и какого-либо прекеша здесь нет и не будет: worker не
// перехватывает ни один запрос приложения. Именно перехват и подмена ответа
// старым Workbox-прекешем были причиной, по которой service worker снесли
// килсвитчем, — человек сутками видел старую версию кабинета, пока браузер
// сам не решал перепроверить регистрацию (ADR-0032). Без обработчика fetch
// отдавать закешированное попросту нечем: push возвращается, не возвращая
// тот риск (ADR-0092, разделы «Решение» и «Последствия»).

// Название школы — из web/src/components/SchoolMark.tsx (SCHOOL_NAME). Этот
// файл не проходит через сборку Vite (см. шапку выше), импортировать
// константу из web/src в него нельзя. Разойдётся с оригиналом — поправить
// нужно оба места; другого способа удержать их вместе для файла вне сборки
// в проекте нет.
const NOTIFICATION_TITLE = 'Школа Сюань-Сюэ';
// 192×192 из той же линейки, что и иконки манифеста (web/public/icons/,
// docs/PWA.md) — размер, который подходит под системное уведомление.
const NOTIFICATION_ICON = '/icons/school-mark-192.png';
// Пуш приходит без текста (ADR-0092, «В push не кладётся текст») — эта
// строка встаёт вместо него, когда лента недоступна или непрочитанного нет.
// Дословно из решения (ADR-0092, раздел «Решение»): тишины вместо
// уведомления здесь быть не должно (CLAUDE.md «Логи и наблюдаемость»).
const FALLBACK_NOTIFICATION_BODY = 'Есть новое уведомление';
const INBOX_URL = '/api/me/inbox?limit=20';
const NOTIFICATIONS_PATH = '/notifications';

self.addEventListener('install', () => {
  // Новая версия встаёт в строй сразу, не дожидаясь закрытия старых вкладок —
  // у килсвитча было то же поведение, нового риска здесь нет: worker ничего
  // не подменяет (см. шапку файла).
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Наследуем работу килсвитча (ADR-0032): у тех, кто ставил кабинет до
      // сентября, в браузере ещё может стоять старый Workbox-прекеш — без
      // очистки он продолжит отдавать закешированную версию оболочки.
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      // В отличие от килсвитча — СЕБЯ НЕ СНИМАЕМ. Это и есть весь смысл
      // возврата service worker (ADR-0092): без постоянной регистрации
      // браузеру некому отдавать push. self.clients.claim() забирает уже
      // открытые вкладки под управление, не дожидаясь их перезагрузки.
      await self.clients.claim();
    })(),
  );
});

/**
 * Свежая строка для показа: первая непрочитанная запись ленты кабинета, а
 * не первая в списке — лента отсортирована по времени последнего изменения
 * (api/src/notifications/inbox.service.ts), и самая верхняя запись бывает
 * уже прочитана на другом устройстве. Сеть отказала, ответ не 2xx или
 * непрочитанных нет — запасная строка, а не тишина (ADR-0092).
 */
async function loadNotificationBody() {
  try {
    const response = await fetch(INBOX_URL, { credentials: 'include' });
    if (!response.ok) return FALLBACK_NOTIFICATION_BODY;
    const page = await response.json();
    const unread = (page.items ?? []).find((item) => !item.readAt);
    return unread ? unread.text : FALLBACK_NOTIFICATION_BODY;
  } catch {
    return FALLBACK_NOTIFICATION_BODY;
  }
}

self.addEventListener('push', (event) => {
  // showNotification обязан случиться всегда, даже если чтение ленты
  // отказало, — event.waitUntil ждёт именно его. Браузер, не дождавшийся
  // showNotification на push, сам рисует «сайт обновился в фоне»: тихого
  // отказа здесь быть не должно (CLAUDE.md «Логи и наблюдаемость»).
  event.waitUntil(
    loadNotificationBody().then((body) =>
      self.registration.showNotification(NOTIFICATION_TITLE, {
        body,
        icon: NOTIFICATION_ICON,
      }),
    ),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      // Открытая вкладка кабинета — фокусируем и уводим на /notifications,
      // а не открываем вторую: у человека с кабинетом на экране «Домой»
      // обычно ровно одна.
      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      const [client] = windowClients;
      if (!client) {
        await self.clients.openWindow(NOTIFICATIONS_PATH);
        return;
      }
      try {
        const navigated = await client.navigate(NOTIFICATIONS_PATH);
        await (navigated ?? client).focus();
      } catch {
        // navigate() может отказать (клиент уже закрылся и т. п.) — фокус
        // на том, что есть, лучше, чем ничего не сделать.
        await client.focus();
      }
    })(),
  );
});
