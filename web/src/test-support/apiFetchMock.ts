// Общая обвязка мока сети для тестов web. Сам `vi.mock('../api/http', …)`
// остаётся в файле теста — vitest поднимает его до импортов и на уровень
// модуля вынести нельзя, — а всё, что после него, живёт здесь: типизированная
// ссылка на мок и сброс между тестами. Именно этот хвост jscpd поймал как
// дубль в AppShell.test.tsx и StudentScreen.test.tsx (CLAUDE.md «Дубли»).
import { afterEach, vi } from 'vitest';
import { apiFetch } from '../api/http';

export const mockedApiFetch = vi.mocked(apiFetch);

/** Зовётся на уровне файла теста: регистрирует сброс мока после каждого
 * теста, чтобы заглушки одного не протекали в следующий. */
export function resetApiFetchBetweenTests(): void {
  afterEach(() => {
    mockedApiFetch.mockReset();
  });
}

/** Ответы сети по префиксу пути: экраны кабинета грузят по два-три разных
 * ресурса сразу (сводка + занятия + классы), и очередь `mockResolvedValueOnce`
 * на таком экране зависит от порядка запросов — то есть от порядка хуков.
 * `Error` в значении означает «этот путь отвечает ошибкой». */
export function mockApiByPath(handlers: Record<string, unknown>): void {
  mockedApiFetch.mockImplementation((path: string) => {
    for (const [prefix, value] of Object.entries(handlers)) {
      if (path.startsWith(prefix)) {
        return value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
      }
    }
    return Promise.reject(new Error(`неожиданный путь: ${path}`));
  });
}
