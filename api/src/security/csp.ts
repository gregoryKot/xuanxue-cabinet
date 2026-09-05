// Единственное место, где перечислены внешние источники, разрешённые CSP
// (правило CLAUDE.md «Безопасность»). Новый сторонний виджет/скрипт —
// сначала добавляется здесь, а не инлайном в main.ts.
//
// styleSrc — только 'self': web/dist/index.html (сборка Vite) подключает CSS
// внешним <link>, инлайн-стилей в проде нет (проверено по собранному файлу).
export const CSP_DIRECTIVES = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'", 'https://telegram.org', 'https://oauth.telegram.org'],
  frameSrc: ['https://oauth.telegram.org', 'https://accounts.google.com'],
  connectSrc: ["'self'", 'https://oauth.telegram.org'],
  imgSrc: ["'self'", 'data:', 'https:'],
  styleSrc: ["'self'"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  frameAncestors: ["'none'"],
} as const;
