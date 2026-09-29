// Мосты — файлы, которым позволено звать apiFetch со строкой (PLAN §17.1).
// Иначе миграция вызова на карту оставляла бы счётчик на месте.
// - apiRoute.ts: типизированная обёртка над картой маршрутов.
// - prefetchFirstScreen.ts: общий механизм предзагрузки. Пути берёт из таблицы
//   routeModules.ts как строки (их собирает `apiRoutePath` — тот же путь, что
//   уйдёт в сеть из `apiRoute`), и ключ карты по строке не восстановить:
//   промис кладётся в prefetchCache.ts под этим же путём, а `apiFetch` его
//   потом забирает. Это не путь, написанный рукой, а вывод из карты.
const BRIDGE_FILES = new Set([
  'web/src/api/apiRoute.ts',
  'web/src/app/prefetchFirstScreen.ts',
]);

/** Файл-мост — его вызовы `apiFetch` гейт не считает. */
export function isBridgeFile(label) {
  return BRIDGE_FILES.has(label);
}
