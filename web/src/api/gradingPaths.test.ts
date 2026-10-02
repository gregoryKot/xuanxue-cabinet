// Строки путей — ключ кэша предзагрузки (prefetchCache.ts): хук строит запрос
// через `apiRoute`, таблица предзагрузки — через эти константы, и сойтись они
// обязаны символ в символ, включая порядок полей query (PLAN §17.1).
import { describe, expect, it, vi } from 'vitest';
import { LIST_LIMIT_MAX } from '@xuanxue/shared';
import { apiRoute } from './apiRoute';
import {
  GRADED_ATTEMPTS_PATH,
  GRADED_ATTEMPTS_QUERY,
  GRADING_QUEUE_PATH,
  GRADING_QUEUE_QUERY,
  attemptPath,
  attemptReviewPath,
} from './gradingPaths';
import { apiFetch } from './http';

vi.mock('./http', () => ({ apiFetch: vi.fn() }));

describe('пути проверки работ', () => {
  it('очередь и проверенные — строки без снимка (F33), status раньше limit', () => {
    expect(GRADING_QUEUE_PATH).toBe(
      `/attempts/queue?status=submitted&limit=${LIST_LIMIT_MAX}`,
    );
    expect(GRADED_ATTEMPTS_PATH).toBe(
      `/attempts/queue?status=graded&limit=${LIST_LIMIT_MAX}`,
    );
  });

  it('своя попытка и карточка проверки — по id', () => {
    expect(attemptPath('652f00000000000000000001')).toBe(
      '/attempts/652f00000000000000000001',
    );
    expect(attemptReviewPath('a1')).toBe('/attempts/a1/review');
  });

  it('запрос хука уходит по той же строке, что и предзагрузка', async () => {
    vi.mocked(apiFetch).mockResolvedValue([]);

    await apiRoute('GET /attempts/queue', { query: GRADING_QUEUE_QUERY });
    await apiRoute('GET /attempts/queue', { query: GRADED_ATTEMPTS_QUERY });
    await apiRoute('GET /attempts/:id', { params: { id: 'a1' } });

    const paths = vi.mocked(apiFetch).mock.calls.map(([path]) => path);
    expect(paths).toEqual([GRADING_QUEUE_PATH, GRADED_ATTEMPTS_PATH, attemptPath('a1')]);
  });
});
