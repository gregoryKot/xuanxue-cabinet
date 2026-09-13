import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExamDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError, apiFetch } from '../api/http';
import { useExams, type ExamFilters } from './useExams';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

function makeExam(overrides: Partial<ExamDto> = {}): ExamDto {
  return {
    id: 'x1',
    title: 'Экзамен',
    description: '',
    level: '',
    blocks: [],
    rubric: [],
    attemptsAllowed: 1,
    status: 'draft',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const NO_FILTERS: ExamFilters = { status: '', level: '' };

afterEach(() => {
  mockedApiFetch.mockReset();
});

describe('useExams — загрузка', () => {
  it('успешная загрузка — exams заполнен, loading снят', async () => {
    mockedApiFetch.mockResolvedValue([makeExam()]);

    const { result } = renderHook(() => useExams(NO_FILTERS));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.exams).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it('монтирование без фильтров — один запрос без status/level в пути', async () => {
    mockedApiFetch.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useExams(NO_FILTERS));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith(
      expect.stringMatching(/^\/exams\?limit=\d+$/),
      expect.anything(),
    );
  });

  it('с фильтрами — status/level в query', async () => {
    mockedApiFetch.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useExams({ status: 'published', level: 'база' }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockedApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('status=published'),
      expect.anything(),
    );
    expect(mockedApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('level=%D0%B1%D0%B0%D0%B7%D0%B0'),
      expect.anything(),
    );
  });

  it('смена фильтра статуса — новый запрос', async () => {
    mockedApiFetch.mockResolvedValue([]);
    const { result, rerender } = renderHook(
      ({ filters }: { filters: ExamFilters }) => useExams(filters),
      { initialProps: { filters: NO_FILTERS } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    const callsBefore = mockedApiFetch.mock.calls.length;

    rerender({ filters: { status: 'archived', level: '' } });

    await waitFor(() =>
      expect(mockedApiFetch.mock.calls.length).toBeGreaterThan(callsBefore),
    );
    const lastCall = mockedApiFetch.mock.calls.at(-1)?.[0] as string;
    expect(lastCall).toContain('status=archived');
  });

  it('ApiError — текст сервера в error', async () => {
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Сервис недоступен', 503, 'unknown'),
    );
    const { result } = renderHook(() => useExams(NO_FILTERS));

    await waitFor(() => expect(result.current.error).toBe('Сервис недоступен'));
  });

  it('не-ApiError — общий текст, не сырое сообщение', async () => {
    mockedApiFetch.mockRejectedValue(new TypeError('внутренняя ошибка'));

    const { result } = renderHook(() => useExams(NO_FILTERS));

    await waitFor(() =>
      expect(result.current.error).toBe(
        'Не удалось загрузить экзамены. Попробуйте ещё раз.',
      ),
    );
  });
});

interface MutationCase {
  name: string;
  call: (result: ReturnType<typeof useExams>) => Promise<void>;
  path: string;
  method: string;
}

const MUTATIONS: MutationCase[] = [
  {
    name: 'create',
    call: (result) => result.create({ title: 'Новый экзамен' }),
    path: '/exams',
    method: 'POST',
  },
  {
    name: 'update',
    call: (result) => result.update('x1', { title: 'Правка' }),
    path: '/exams/x1',
    method: 'PATCH',
  },
  {
    name: 'remove',
    call: (result) => result.remove('x1'),
    path: '/exams/x1',
    method: 'DELETE',
  },
];

describe('useExams — мутации (read-after-write)', () => {
  it.each(MUTATIONS)(
    '$name() — $method $path, затем перечитывает список',
    async ({ call, path, method }) => {
      mockedApiFetch.mockResolvedValueOnce([makeExam()]);
      const { result } = renderHook(() => useExams(NO_FILTERS));
      await waitFor(() => expect(result.current.loading).toBe(false));

      mockedApiFetch.mockResolvedValueOnce(undefined);
      mockedApiFetch.mockResolvedValueOnce([]);
      await act(async () => {
        await call(result.current);
      });

      expect(mockedApiFetch).toHaveBeenCalledWith(
        path,
        expect.objectContaining({ method }),
      );
      expect(result.current.exams).toHaveLength(0);
    },
  );
});
