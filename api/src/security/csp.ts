// Единственное место, где перечислены внешние источники, разрешённые CSP
// (правило CLAUDE.md «Безопасность»). Новый сторонний виджет/скрипт —
// сначала добавляется здесь, а не инлайном в main.ts.
//
// styleSrc — только 'self': web/dist/index.html (сборка Vite) подключает CSS
// внешним <link>, инлайн-стилей в проде нет (проверено по собранному файлу).
//
// Ни telegram.org, ни oauth.telegram.org здесь больше нет (ADR-0028): виджет
// `telegram-widget.js` и его попап убраны, вход — переход текущей вкладки на
// `https://oauth.telegram.org/auth` (`window.location.assign`,
// web/src/auth/telegramAuthRedirect.ts). Такой переход — навигация, а не
// подгрузка ресурса или встраивание в iframe, поэтому CSP (scriptSrc,
// connectSrc) его не ограничивает: ни `form-action`, ни `navigate-to` в этом
// списке не заданы.
export const CSP_DIRECTIVES = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  // accounts.google.com сюда не входит и не нужен (ADR-0145): вход —
  // переход вкладки на 302 (`GET /api/auth/google/start`), не подгрузка
  // ресурса и не встраивание в iframe — CSP навигацию не ограничивает;
  // обмен code→id_token идёт сервером (GoogleTokenClient), браузер его не
  // видит вовсе. Тот же довод, что у Telegram-входа абзацем выше.
  connectSrc: ["'self'"],
  imgSrc: ["'self'", 'data:', 'https:'],
  styleSrc: ["'self'"],
  // Встроенный плеер записи (ADR-0100) — единственная причина, по которой
  // frameSrc вообще объявлен: без него директива падала на
  // `default-src 'self'` и фрейм на чужой домен не открывался вовсе.
  // Ровно два хостинга, ровно те, чей адрес встраивания выводится из ссылки
  // (shared/src/video-embed.ts): nocookie-домен YouTube и Rutube. 'self'
  // сюда не входит — своих фреймов у кабинета нет, а неиспользуемая
  // поверхность CSP — тот же риск, что лишняя env-переменная (SECURITY §6).
  frameSrc: ['https://www.youtube-nocookie.com', 'https://rutube.ru'],
  // <video> вопроса/варианта запрашивает `/api/exam-videos/:id`, который
  // отвечает 302 на подписанную ссылку R2 (ADR-0133) — браузер проверяет
  // CSP по адресу, на который редирект в итоге ведёт, не по адресу самого
  // запроса. Домен R2 у каждого аккаунта свой (`<accountId>.r2.
  // cloudflarestorage.com`, r2.config.ts), поэтому маска по поддомену, не
  // точный хост.
  mediaSrc: ["'self'", 'https://*.r2.cloudflarestorage.com'],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  frameAncestors: ["'none'"],
} as const;
