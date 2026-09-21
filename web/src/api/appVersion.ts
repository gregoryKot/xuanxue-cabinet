// Хранилище «вышла новая версия сборки» (ADR-0101) — без React, тот же приём,
// что модульный слушатель setUnauthorizedListener в http.ts: apiFetch читает
// заголовок на каждом ответе и раньше любого компонента, а модульная
// переменная переживает ремонты дерева React (переход между экранами не
// должен сбрасывать флаг).
//
// Вкладку кабинета держат открытой неделями (ADR-0076), а деплой уезжает по
// нескольку раз в день. Первое увиденное значение заголовка — просто «какая
// сборка сейчас», не повод для баннера; отличное от него — деплой, который
// вкладка ещё не подхватила.
type AppVersionListener = () => void;

let rememberedVersion: string | null = null;
let hasNewVersion = false;
const listeners = new Set<AppVersionListener>();

/**
 * Запомнить версию сборки из заголовка ответа API. `null` — заголовка нет
 * (локальная разработка, докер-смок без переменной сборки, ADR-0101) — не
 * делает ничего. Первое непустое значение запоминается молча. Флаг, однажды
 * поднятый, больше не гаснет: при выкатке инстансы Railway отвечают
 * вперемешку старым и новым SHA, пока раскатка не завершится, и строка
 * баннера не должна мигать туда-обратно.
 */
export function noteAppVersion(version: string | null): void {
  if (version === null) return;
  if (hasNewVersion) return;

  if (rememberedVersion === null) {
    rememberedVersion = version;
    return;
  }
  if (version === rememberedVersion) return;

  hasNewVersion = true;
  listeners.forEach((listener) => listener());
}

/** Снимок для useSyncExternalStore — NewVersionBanner.tsx. */
export function hasNewAppVersion(): boolean {
  return hasNewVersion;
}

/** Подписка для useSyncExternalStore. Возвращает функцию отписки. */
export function subscribeToAppVersion(listener: AppVersionListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
