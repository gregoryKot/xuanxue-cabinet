// Подсказка тегов — по образцу schedule/useClasses.test.ts. Сбой запроса не
// должен всплывать наружу как ошибка (ни одна из пяти форм не показывает
// баннер по этому хуку) — здесь достаточно проверить, что список остаётся
// пустым, а не что-то падает.
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TagSummaryDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError, apiFetch } from '../api/http';
import { useTagOptions } from './useTagOptions';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
});

function makeTagSummary(overrides: Partial<TagSummaryDto> = {}): TagSummaryDto {
  return {
    tag: 'дракон',
    lessonCount: 0,
    materialCount: 0,
    channelCount: 0,
    examItemCount: 0,
    ...overrides,
  };
}

describe('useTagOptions', () => {
  it('отдаёт теги в порядке, который прислал сервер', async () => {
    mockedApiFetch.mockResolvedValue([
      makeTagSummary({ tag: 'старшая' }),
      makeTagSummary({ tag: 'база' }),
      makeTagSummary({ tag: 'разминка' }),
    ]);

    const { result } = renderHook(() => useTagOptions());

    await waitFor(() => expect(result.current).toEqual(['старшая', 'база', 'разминка']));
  });

  it('пустая сводка — пустой список тегов', async () => {
    mockedApiFetch.mockResolvedValue([]);

    const { result } = renderHook(() => useTagOptions());

    await waitFor(() => expect(mockedApiFetch).toHaveBeenCalled());
    expect(result.current).toEqual([]);
  });

  it('сбой запроса — пустой список тегов, не исключение', async () => {
    mockedApiFetch.mockRejectedValue(new ApiError('Сервис недоступен', 503, 'unknown'));

    const { result } = renderHook(() => useTagOptions());

    await waitFor(() => expect(mockedApiFetch).toHaveBeenCalled());
    expect(result.current).toEqual([]);
  });

  it('запрос идёт по пути сводки тегов школы', () => {
    mockedApiFetch.mockResolvedValue([]);

    renderHook(() => useTagOptions());

    expect(mockedApiFetch).toHaveBeenCalledWith('/tags?limit=200', expect.anything());
  });

  it('withMaterialsOnly — только теги с materialCount > 0, остальные не идут в список', async () => {
    mockedApiFetch.mockResolvedValue([
      makeTagSummary({ tag: 'старшая', materialCount: 2 }),
      makeTagSummary({ tag: 'без материалов', materialCount: 0 }),
      makeTagSummary({ tag: 'база', materialCount: 1 }),
    ]);

    const { result } = renderHook(() => useTagOptions({ withMaterialsOnly: true }));

    await waitFor(() => expect(result.current).toEqual(['старшая', 'база']));
  });
});
