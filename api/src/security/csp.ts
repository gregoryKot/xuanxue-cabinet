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
// списке не заданы. `frameSrc` больше не объявляется вовсе — попапа/фрейма
// на чужой домен у нас не осталось, директива падает на `default-src 'self'`.
export const CSP_DIRECTIVES = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  // accounts.google.com сюда не входит: вход через Google ещё не реализован
  // (ADR-0005 — принято архитектурно, но код появится отдельным PR, PLAN.md
  // §5 «Вход»), а неиспользуемая поверхность CSP — тот же риск, что лишняя
  // env-переменная (SECURITY §6). Добавить обратно вместе с самим OAuth-потоком.
  connectSrc: ["'self'"],
  imgSrc: ["'self'", 'data:', 'https:'],
  styleSrc: ["'self'"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  frameAncestors: ["'none'"],
} as const;
