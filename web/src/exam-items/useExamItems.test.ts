import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExamItemDto, ExamItemStatus } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError, apiFetch } from '../api/http';
import { useExamItems } from './useExamItems';

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
    status: 'draft',
    version: 1,
    history: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

afterEach(() => {
  mockedApiFetch.mockReset();
});

describe('useExamItems — загрузка', () => {
  it('успешная загрузка — items заполнен, loading снят', async () => {
    mockedApiFetch.mockResolvedValue([makeItem()]);

    const { result } = renderHook(() => useExamItems(''));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it('монтирование без фильтра — один запрос без status в пути', async () => {
    mockedApiFetch.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useExamItems(''));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith(
      expect.stringMatching(/^\/exam-items\?limit=\d+$/),
      expect.anything(),
    );
  });

  it('с фильтром — status в query', async () => {
    mockedApiFetch.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useExamItems('published'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockedApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('status=published'),
      expect.anything(),
    );
  });

  it('смена фильтра статуса — новый запрос', async () => {
    mockedApiFetch.mockResolvedValue([]);
    const { result, rerender } = renderHook(
      ({ status }: { status: ExamItemStatus | '' }) => useExamItems(status),
      { initialProps: { status: '' as ExamItemStatus | '' } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    const callsBefore = mockedApiFetch.mock.calls.length;

    rerender({ status: 'archived' });

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
    const { result } = renderHook(() => useExamItems(''));

    await waitFor(() => expect(result.current.error).toBe('Сервис недоступен'));
  });

  it('не-ApiError — общий текст, не сырое сообщение', async () => {
    mockedApiFetch.mockRejectedValue(new TypeError('внутренняя ошибка'));

    const { result } = renderHook(() => useExamItems(''));

    await waitFor(() =>
      expect(result.current.error).toBe(
        'Не удалось загрузить вопросы. Попробуйте ещё раз.',
      ),
    );
  });
});
