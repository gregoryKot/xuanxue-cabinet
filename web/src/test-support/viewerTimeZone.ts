// Пояс зрителя в тестах. Подписи и бейджи пояса (schedule/timezoneLabel.ts)
// показываются, только когда пояс зрителя отличается от пояса школы, а пояс
// зрителя по умолчанию — системный пояс машины. Тест, который ждал подпись,
// падал у владельца репозитория: он живёт в Asia/Jerusalem, то есть в поясе
// школы, и подписывать ему было нечего. CI этого не видел никогда — он гоняет
// vitest под UTC и Australia/Sydney (CLAUDE.md «Детерминизм»: тест не зависит
// от окружения).
//
// Пояс задаётся через `process.env.TZ`, а не подменой `resolvedOptions`:
// от него зависят и Intl, и форматтеры дат (lib/formatDate.ts), поэтому
// зритель получается цельным — подпись, время на карточке и день недели
// считаны от одного пояса.
import { afterEach, beforeEach, vi } from 'vitest';

/** Пояс зрителя по умолчанию: без перехода на летнее время (смещение не
 * зависит от даты) и заведомо не совпадает с поясами школы в тестовых данных
 * — Asia/Jerusalem, Pacific/Auckland, Pacific/Kiritimati. */
export const TEST_VIEWER_TZ = 'Europe/Moscow';

/** Зовётся на уровне файла теста (как `resetApiFetchBetweenTests`): фиксирует
 * пояс зрителя на время каждого теста и возвращает окружение после. */
export function stubViewerTimeZone(timeZone: string = TEST_VIEWER_TZ): void {
  beforeEach(() => {
    vi.stubEnv('TZ', timeZone);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });
}
