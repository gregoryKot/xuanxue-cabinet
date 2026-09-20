// Общая обвязка мока сети для тестов web. Сам `vi.mock('../api/http', …)`
// остаётся в файле теста — vitest поднимает его до импортов и на уровень
// модуля вынести нельзя, — а всё, что после него, живёт здесь: типизированная
// ссылка на мок и сброс между тестами. Именно этот хвост jscpd поймал как
// дубль в AppShell.test.tsx и LessonsScreen.test.tsx (CLAUDE.md «Дубли»).
import { afterEach, vi } from 'vitest';
import { isMutatingMethod } from '@xuanxue/shared';
import { apiFetch } from '../api/http';

const NO_ANSWERS_MESSAGE =
  'failNextWrite: сначала заглушка ответов (mockApiByPath или mockImplementation)';

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

/** Ошибка в ответ на следующий меняющий запрос (POST/PATCH/DELETE) — один раз,
 * поверх уже заданных ответов.
 *
 * `mockRejectedValueOnce` для этого не годится: очередь `once` срабатывает на
 * любом следующем запросе, а экран догружает своё и после того, как тест
 * дождался нужного элемента, — подсказка тегов формы материала
 * (useMaterialTagOptions.ts) уходит в сеть, когда поля уже на экране, и уйдёт
 * она до или после `findBy*` по воле планировщика React. Ошибку доставалось то
 * ей (тогда сохранение проходило успешно и экран уезжал на список), то
 * сохранению: 6 раз на 300 монтирований — столько мигал тест «ошибка сервера с
 * details» (расследование 2026-09-20). Здесь ошибка привязана к самому
 * запросу, а не к его номеру в очереди.
 *
 * Зовётся после `mockApiByPath`: новая таблица ответов ставится поверх и
 * снимает уже назначенную ошибку. */
export function failNextWrite(error: Error): void {
  const answer = mockedApiFetch.getMockImplementation();
  if (!answer) throw new Error(NO_ANSWERS_MESSAGE);

  mockedApiFetch.mockImplementation((path, init) => {
    const method = init?.method;
    if (method === undefined || !isMutatingMethod(method)) return answer(path, init);
    // Один раз: дальше отвечает прежняя заглушка — повтор сохранения после
    // ошибки должен проходить, как на живом экране.
    mockedApiFetch.mockImplementation(answer);
    return Promise.reject(error);
  });
}
