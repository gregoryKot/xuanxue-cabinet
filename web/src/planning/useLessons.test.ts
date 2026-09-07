import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LessonDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { useLessons, type UseLessonsResult } from './useLessons';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

function makeLesson(overrides: Partial<LessonDto> = {}): LessonDto {
  return {
    id: 'l1',
    classId: 'c1',
    startsAt: '2026-09-08T16:00:00.000Z',
    durationMin: 60,
    topic: '',
    status: 'scheduled',
    recordings: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

afterEach(() => {
  mockedApiFetch.mockReset();
});

async function renderReady() {
  mockedApiFetch.mockResolvedValueOnce([]);
  const { result } = renderHook(() => useLessons());
  await waitFor(() => expect(result.current.loading).toBe(false));
  return result;
}

describe('useLessons — загрузка', () => {
  it('запрашивает /lessons с окном планирования и лимитом', async () => {
    const result = await renderReady();

    expect(mockedApiFetch).toHaveBeenCalledWith(
      expect.stringMatching(/^\/lessons\?from=.+&to=.+&limit=200$/),
      expect.anything(),
    );
    expect(result.current.lessons).toEqual([]);
  });

  // Гонка запросов и разбор ошибки (ApiError/общий текст) — тест общей
  // логики лежит в hooks/useAbortableFetch.test.ts, здесь незачем повторять.
});

interface MutationCase {
  name: string;
  call: (result: UseLessonsResult) => Promise<void>;
  path: string;
  method: string;
}

const MUTATIONS: MutationCase[] = [
  {
    name: 'create',
    call: (result) =>
      result.create({ classId: 'c1', startsAt: '2026-09-08T16:00:00.000Z' }),
    path: '/lessons',
    method: 'POST',
  },
  {
    name: 'update',
    call: (result) => result.update('l1', { status: 'cancelled' }),
    path: '/lessons/l1',
    method: 'PATCH',
  },
  {
    name: 'addRecording',
    call: (result) => result.addRecording('l1', { url: 'https://youtu.be/x' }),
    path: '/lessons/l1/recording',
    method: 'POST',
  },
];

describe('useLessons — мутации (read-after-write)', () => {
  it.each(MUTATIONS)(
    '$name — $method $path, reload перечитывает список до конца',
    async ({ call, path, method }) => {
      const result = await renderReady();

      mockedApiFetch.mockResolvedValueOnce({});
      mockedApiFetch.mockResolvedValueOnce([]);
      await act(async () => {
        await call(result.current);
      });

      expect(mockedApiFetch).toHaveBeenCalledWith(
        path,
        expect.objectContaining({ method }),
      );
      // Не только факт вызова reload — сам список в состоянии обновился.
      expect(result.current.lessons).toEqual([]);
    },
  );

  it('update(...) — refetch вернул изменённое занятие, result.current.lessons содержит изменение', async () => {
    const result = await renderReady();
    const cancelledLesson = makeLesson({ status: 'cancelled' });

    mockedApiFetch.mockResolvedValueOnce({});
    mockedApiFetch.mockResolvedValueOnce([cancelledLesson]);
    await act(async () => {
      await result.current.update('l1', { status: 'cancelled' });
    });

    expect(result.current.lessons).toEqual([cancelledLesson]);
  });
});
