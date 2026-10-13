// Запущен ли модуль как точка входа (`node scripts/x.mjs`), а не импортирован
// из теста. Сравнивать `import.meta.url` со строкой «file:// + argv[1]»
// нельзя: на Windows первый — `file:///D:/…`, второй — `file://D:\…`, условие
// всегда ложно, и гейт молча не запускается с кодом 0. Так `npm run check` на
// Windows ничего не проверял (найдено 2026-10-13). `pathToFileURL` собирает URL
// по правилам платформы, поэтому сравнение работает везде.
import { pathToFileURL } from 'url';

export function isMainModule(moduleUrl) {
  const entry = process.argv[1];
  if (!entry) return false;
  return pathToFileURL(entry).href === moduleUrl;
}
