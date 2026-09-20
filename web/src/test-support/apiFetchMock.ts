// Общая обвязка мока сети для тестов web. Сам `vi.mock('../api/http', …)`
// остаётся в файле теста — vitest поднимает его до импортов и на уровень
// модуля вынести нельзя, — а всё, что после него, живёт здесь: типизированная
// ссылка на мок и сброс между тестами. Именно этот хвост jscpd поймал как
// дубль в AppShell.test.tsx и LessonsScreen.test.tsx (CLAUDE.md «Дубли»).
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
 * `Error` в значении означает «этот путь отвечает ошибкой».
 *
 * Отсюда же правило: на смонтированном экране очередь `…Once` не ставится
 * вовсе, даже «уже всё загрузилось». Эффект соседнего хука срабатывает то до
 * ожидания `findBy*`, то после него — во втором случае его запрос забирает
 * первый ответ очереди, и дальше вся очередь сдвинута. Так мигал
 * AttemptReviewScreen.test.tsx: форма оценки тянет свои заготовки
 * (useGradingPresets), а карточка после отметки видео приходила старой
 * (красный CI на main, a155bc1, 2026-09-20). Ответ на действие — второй
 * вызов `mockApiByPath` с новыми телами: путь действия и путь перечитывания
 * разные, порядок вызовов перестаёт что-либо значить. */
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
