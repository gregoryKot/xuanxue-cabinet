import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExamItemDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError, apiFetch } from '../api/http';
import { useExamItems, type ExamItemFilters } from './useExamItems';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

function makeItem(overrides: Partial<ExamItemDto> = {}): ExamItemDto {
  return {
    id: 'e1',
    kind: 'text',
    prompt: 'Вопрос',
    options: [],
    tags: [],
    status: 'draft',
    version: 1,
    history: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const NO_FILTERS: ExamItemFilters = { status: '', kind: '', tag: '' };

afterEach(() => {
  mockedApiFetch.mockReset();
});

describe('useExamItems — загрузка', () => {
  it('успешная загрузка — items заполнен, loading снят', async () => {
    mockedApiFetch.mockResolvedValue([makeItem()]);

    const { result } = renderHook(() => useExamItems(NO_FILTERS));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it('монтирование без фильтров — один запрос без status/kind/tag в пути', async () => {
    mockedApiFetch.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useExamItems(NO_FILTERS));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith(
      expect.stringMatching(/^\/exam-items\?limit=\d+$/),
      expect.anything(),
    );
  });

  it('с фильтрами — status/kind/tag в query', async () => {
    mockedApiFetch.mockResolvedValueOnce([]);
    const { result } = renderHook(() =>
      useExamItems({ status: 'published', kind: 'single', tag: 'ян' }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockedApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('status=published'),
      expect.anything(),
    );
    expect(mockedApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('kind=single'),
      expect.anything(),
    );
    expect(mockedApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('tag=%D1%8F%D0%BD'),
      expect.anything(),
    );
  });

  it('смена фильтра статуса — новый запрос', async () => {
    mockedApiFetch.mockResolvedValue([]);
    const { result, rerender } = renderHook(
      ({ filters }: { filters: ExamItemFilters }) => useExamItems(filters),
      { initialProps: { filters: NO_FILTERS } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    const callsBefore = mockedApiFetch.mock.calls.length;

    rerender({ filters: { status: 'archived', kind: '', tag: '' } });

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
    const { result } = renderHook(() => useExamItems(NO_FILTERS));

    await waitFor(() => expect(result.current.error).toBe('Сервис недоступен'));
  });

  it('не-ApiError — общий текст, не сырое сообщение', async () => {
    mockedApiFetch.mockRejectedValue(new TypeError('внутренняя ошибка'));

    const { result } = renderHook(() => useExamItems(NO_FILTERS));

    await waitFor(() =>
      expect(result.current.error).toBe(
        'Не удалось загрузить вопросы. Попробуйте ещё раз.',
      ),
    );
  });
});

interface MutationCase {
  name: string;
  call: (result: ReturnType<typeof useExamItems>) => Promise<void>;
  path: string;
  method: string;
}

const MUTATIONS: MutationCase[] = [
  {
    name: 'create',
    call: (result) => result.create({ kind: 'text', prompt: 'Новый вопрос' }),
    path: '/exam-items',
    method: 'POST',
  },
  {
    name: 'update',
    call: (result) => result.update('e1', { prompt: 'Правка' }),
    path: '/exam-items/e1',
    method: 'PATCH',
  },
  {
    name: 'remove',
    call: (result) => result.remove('e1'),
    path: '/exam-items/e1',
    method: 'DELETE',
  },
];

describe('useExamItems — мутации (read-after-write)', () => {
  it.each(MUTATIONS)(
    '$name() — $method $path, затем перечитывает список',
    async ({ call, path, method }) => {
      mockedApiFetch.mockResolvedValueOnce([makeItem()]);
      const { result } = renderHook(() => useExamItems(NO_FILTERS));
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
      expect(result.current.items).toHaveLength(0);
    },
  );
});
