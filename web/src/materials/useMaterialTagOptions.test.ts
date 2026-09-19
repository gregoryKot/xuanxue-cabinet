// Подсказка тегов — по образцу schedule/useClasses.test.ts. Сбой запроса не
// должен всплывать наружу как ошибка (MaterialFormFields.tsx не показывает
// баннер по этому хуку) — здесь достаточно проверить, что список остаётся
// пустым, а не что-то падает.
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MaterialDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError, apiFetch } from '../api/http';
import { useMaterialTagOptions } from './useMaterialTagOptions';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
});

function makeMaterial(overrides: Partial<MaterialDto> = {}): MaterialDto {
  return {
    id: 'm1',
    title: 'Ван Пэйшэн — форма 24',
    url: 'https://example.com/book',
    kind: 'book',
    classIds: [],
    lessonIds: [],
    access: 'all',
    tags: [],
    createdBy: 'u1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('useMaterialTagOptions', () => {
  it('собирает уникальные теги из списка материалов', async () => {
    mockedApiFetch.mockResolvedValue([
      makeMaterial({ tags: ['старшая', 'база'] }),
      makeMaterial({ id: 'm2', tags: ['база', 'разминка'] }),
    ]);

    const { result } = renderHook(() => useMaterialTagOptions());

    await waitFor(() => expect(result.current).toEqual(['старшая', 'база', 'разминка']));
  });

  it('пустой список материалов — пустой список тегов', async () => {
    mockedApiFetch.mockResolvedValue([]);

    const { result } = renderHook(() => useMaterialTagOptions());

    await waitFor(() => expect(mockedApiFetch).toHaveBeenCalled());
    expect(result.current).toEqual([]);
  });

  it('сбой запроса — пустой список тегов, не исключение', async () => {
    mockedApiFetch.mockRejectedValue(new ApiError('Сервис недоступен', 503, 'unknown'));

    const { result } = renderHook(() => useMaterialTagOptions());

    await waitFor(() => expect(mockedApiFetch).toHaveBeenCalled());
    expect(result.current).toEqual([]);
  });

  it('запрос без фильтра — путь без kind и tag', () => {
    mockedApiFetch.mockResolvedValue([]);

    renderHook(() => useMaterialTagOptions());

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/materials?limit=200',
      expect.anything(),
    );
  });
});
