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
