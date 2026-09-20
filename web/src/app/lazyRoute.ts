// Обёртка над React.lazy на случай сбоя загрузки чанка после деплоя
// (ADR-0071). Старые хешированные чанки исчезают с сервера сразу после
// выкладки новой сборки — открытая вкладка падает на первом же переходе на
// экран, чанк которого сменил имя. index.html отдаётся с no-cache
// (docs/RUNBOOK.md), поэтому один window.location.reload() приносит свежую
// сборку, и человек возвращается туда же, откуда ушёл (адрес не меняется).
//
// Повторный провал уже после такой перезагрузки — не устаревший чанк (её
// перезагрузка обновила), а настоящая поломка модуля: второй раз вкладку не
// перезагружаем (иначе цикл), даём ошибке дойти до ErrorBoundary — та сама
// отправит отчёт kind: 'render'.
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { reportClientError } from '../errors/reportClientError';
import type { RouteLoader } from './routeModules';

// sessionStorage, не localStorage — метка про один сеанс вкладки, тот же
// приём, что RETURN_TO_KEY в auth/returnTo.ts; переживать закрытие браузера
// ей незачем.
const CHUNK_RELOAD_KEY = 'xuanxue:chunkReload';

/** Уже перезагружали вкладку из-за провала чанка в этом сеансе. Сбой чтения
 * (приватный режим Safari) — считаем, что не перезагружали: лишняя
 * перезагрузка безопаснее, чем зависший навсегда экран. */
function hasChunkReloadFlag(): boolean {
  try {
    return sessionStorage.getItem(CHUNK_RELOAD_KEY) !== null;
  } catch {
    return false;
  }
}

function setChunkReloadFlag(): void {
  try {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
  } catch {
    // недоступное хранилище — перезагружаем и без метки, хуже не станет
  }
}

function clearChunkReloadFlag(): void {
  try {
    sessionStorage.removeItem(CHUNK_RELOAD_KEY);
  } catch {
    // недоступное хранилище — снимать нечего
  }
}

/**
 * `React.lazy(load)` с одной перезагрузкой страницы на провал чанка: не
 * догрузился код экрана (свежий деплой) → отчёт kind: 'chunk' и один
 * `reload()`. Второй провал подряд — уже не устаревший чанк, а реальная
 * поломка, отдаём её дальше как обычный сбой рендера.
 */
export function lazyRoute(load: RouteLoader): LazyExoticComponent<ComponentType> {
  return lazy(async () => {
    try {
      const loadedModule = await load();
      clearChunkReloadFlag();
      return loadedModule;
    } catch (error) {
      if (hasChunkReloadFlag()) throw error;
      setChunkReloadFlag();
      await reportClientError('chunk', error);
      window.location.reload();
      // Перезагрузка вот-вот заменит страницу целиком — молчим и ждём её,
      // а не рисуем сбой поверх исчезающего экрана.
      return new Promise<{ default: ComponentType }>(() => {});
    }
  });
}
