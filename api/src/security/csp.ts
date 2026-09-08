// Единственное место, где перечислены внешние источники, разрешённые CSP
// (правило CLAUDE.md «Безопасность»). Новый сторонний виджет/скрипт —
// сначала добавляется здесь, а не инлайном в main.ts.
//
// styleSrc — только 'self': web/dist/index.html (сборка Vite) подключает CSS
// внешним <link>, инлайн-стилей в проде нет (проверено по собранному файлу).
export const CSP_DIRECTIVES = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'", 'https://telegram.org', 'https://oauth.telegram.org'],
  // accounts.google.com сюда не входит: вход через Google ещё не реализован
  // (ADR-0005 — принято архитектурно, но код появится отдельным PR, PLAN.md
  // §5 «Вход»), а неиспользуемая поверхность CSP — тот же риск, что лишняя
  // env-переменная (SECURITY §6). Добавить обратно вместе с самим OAuth-потоком.
  frameSrc: ['https://oauth.telegram.org'],
  connectSrc: ["'self'", 'https://oauth.telegram.org'],
  imgSrc: ["'self'", 'data:', 'https:'],
  styleSrc: ["'self'"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  frameAncestors: ["'none'"],
} as const;
