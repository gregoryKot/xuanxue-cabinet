// По образцу exam-items/useExamImageUpload.test.ts — сеть мокается на
// уровне apiFetch, свои проверки (формат/размер/имя) проверяются без сети.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  MATERIAL_FILE_EMPTY_MESSAGE,
  MATERIAL_FILE_LIMITS,
  MATERIAL_FILE_TOO_LARGE_MESSAGE,
  MATERIAL_FILE_UNSUPPORTED_MESSAGE,
  type MaterialDto,
} from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import { mockedApiFetch, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { useMaterialFileUpload } from './useMaterialFileUpload';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const MATERIAL_ID = 'm1';

function makeMaterial(overrides: Partial<MaterialDto> = {}): MaterialDto {
  return {
    id: MATERIAL_ID,
    title: 'Ван Пэйшэн — форма 24',
    url: '',
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

function makeFile(bytes: number, name = 'book.pdf', type = 'application/pdf'): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe('useMaterialFileUpload — проверки до сети', () => {
  it('неподдерживаемый тип — ошибка, apiFetch не вызван', async () => {
    const { result } = renderHook(() => useMaterialFileUpload(MATERIAL_ID));

    let dto: MaterialDto | null = makeMaterial();
    await act(async () => {
      dto = await result.current.upload(makeFile(10, 'archive.zip', 'application/zip'));
    });

    expect(dto).toBeNull();
    expect(result.current.error).toBe(MATERIAL_FILE_UNSUPPORTED_MESSAGE);
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('файл больше потолка — ошибка, apiFetch не вызван', async () => {
    const { result } = renderHook(() => useMaterialFileUpload(MATERIAL_ID));

    let dto: MaterialDto | null = makeMaterial();
    await act(async () => {
      dto = await result.current.upload(makeFile(MATERIAL_FILE_LIMITS.maxBytes + 1));
    });

    expect(dto).toBeNull();
    expect(result.current.error).toBe(MATERIAL_FILE_TOO_LARGE_MESSAGE);
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('пустой файл — ошибка, apiFetch не вызван', async () => {
    const { result } = renderHook(() => useMaterialFileUpload(MATERIAL_ID));

    let dto: MaterialDto | null = makeMaterial();
    await act(async () => {
      dto = await result.current.upload(makeFile(0));
    });

    expect(dto).toBeNull();
    expect(result.current.error).toBe(MATERIAL_FILE_EMPTY_MESSAGE);
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });
});

describe('useMaterialFileUpload — загрузка', () => {
  it('подходящий файл — POST с телом-файлом на адрес с именем в query', async () => {
    const material = makeMaterial();
    mockedApiFetch.mockResolvedValueOnce(material);
    const file = makeFile(10, 'book.pdf');

    const { result } = renderHook(() => useMaterialFileUpload(MATERIAL_ID));
    let dto: MaterialDto | null = null;
    await act(async () => {
      dto = await result.current.upload(file);
    });

    expect(dto).toEqual(material);
    expect(mockedApiFetch).toHaveBeenCalledWith('/materials/m1/file?name=book.pdf', {
      method: 'POST',
      body: file,
    });
    expect(result.current.error).toBeNull();
    expect(result.current.pending).toBe(false);
  });

  it('длинное имя обрезается до лимита, расширение сохраняется', async () => {
    mockedApiFetch.mockResolvedValueOnce(makeMaterial());
    const longName = `${'а'.repeat(MATERIAL_FILE_LIMITS.name)}.pdf`;
    const file = makeFile(10, longName);

    const { result } = renderHook(() => useMaterialFileUpload(MATERIAL_ID));
    await act(async () => {
      await result.current.upload(file);
    });

    const calledPath = mockedApiFetch.mock.calls[0]?.[0] as string;
    const nameParam = decodeURIComponent(calledPath.split('name=')[1] ?? '');
    expect(nameParam.length).toBeLessThanOrEqual(MATERIAL_FILE_LIMITS.name);
    expect(nameParam.endsWith('.pdf')).toBe(true);
  });

  it('ApiError с сервера — error = сообщение сервера, upload вернёт null', async () => {
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Материал уже удалён. Обновите список материалов.', 404, 'not_found'),
    );

    const { result } = renderHook(() => useMaterialFileUpload(MATERIAL_ID));
    let dto: MaterialDto | null = makeMaterial();
    await act(async () => {
      dto = await result.current.upload(makeFile(10));
    });

    expect(dto).toBeNull();
    expect(result.current.error).toBe('Материал уже удалён. Обновите список материалов.');
  });
});

describe('useMaterialFileUpload — удаление', () => {
  it('remove() — DELETE на адрес файла, возвращает обновлённый материал', async () => {
    const material = makeMaterial();
    mockedApiFetch.mockResolvedValueOnce(material);

    const { result } = renderHook(() => useMaterialFileUpload(MATERIAL_ID));
    let dto: MaterialDto | null = null;
    await act(async () => {
      dto = await result.current.remove();
    });

    expect(dto).toEqual(material);
    expect(mockedApiFetch).toHaveBeenCalledWith('/materials/m1/file', {
      method: 'DELETE',
    });
  });

  it('сбой удаления (Error) — его текст в error, remove() вернёт null', async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error('нет сети'));

    const { result } = renderHook(() => useMaterialFileUpload(MATERIAL_ID));
    let dto: MaterialDto | null = makeMaterial();
    await act(async () => {
      dto = await result.current.remove();
    });

    expect(dto).toBeNull();
    expect(result.current.error).toBe('нет сети');
  });

  it('брошено не-Error значение — запасной текст, не «undefined»', async () => {
    mockedApiFetch.mockRejectedValueOnce('не Error');

    const { result } = renderHook(() => useMaterialFileUpload(MATERIAL_ID));
    await act(async () => {
      await result.current.remove();
    });

    expect(result.current.error).toBe('Не удалось загрузить файл. Попробуйте ещё раз.');
  });
});
