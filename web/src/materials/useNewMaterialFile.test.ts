// Файл у ещё не созданного материала (ADR-0133) — `uploadMaterialFile`
// мокается (сеть), `checkMaterialFile` остаётся настоящим: негодный формат
// должен ловиться той же логикой, что видит пользователь.
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MATERIAL_FILE_UNSUPPORTED_MESSAGE, type MaterialDto } from '@xuanxue/shared';
import { ApiError } from '../api/http';
import type * as MaterialFileUploadModule from './materialFileUpload';
import { uploadMaterialFile } from './materialFileUpload';
import {
  UPLOAD_AFTER_CREATE_ERROR_MESSAGE,
  useNewMaterialFile,
} from './useNewMaterialFile';

vi.mock('./materialFileUpload', async (importOriginal) => {
  const actual = await importOriginal<typeof MaterialFileUploadModule>();
  return { ...actual, uploadMaterialFile: vi.fn() };
});

const mockedUpload = vi.mocked(uploadMaterialFile);
afterEach(() => mockedUpload.mockReset());

function makeMaterial(overrides: Partial<MaterialDto> = {}): MaterialDto {
  return {
    id: 'm1',
    title: 'Методичка',
    kind: 'document',
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

function makeFile(type = 'application/pdf', bytes = 10): File {
  return new File([new Uint8Array(bytes)], 'file.pdf', { type });
}

describe('useNewMaterialFile — успешный путь', () => {
  it('создаёт материал и следом загружает выбранный файл, потом забывает его', async () => {
    const created = makeMaterial();
    const onCreate = vi.fn().mockResolvedValue(created);
    mockedUpload.mockResolvedValue({ ...created, file: undefined });
    const { result } = renderHook(() => useNewMaterialFile(onCreate));

    act(() => result.current.selectFile(makeFile()));
    expect(result.current.file).not.toBeNull();

    let returned: MaterialDto | undefined;
    await act(async () => {
      returned = await result.current.create({ title: 'Методичка', kind: 'document' });
    });

    expect(onCreate).toHaveBeenCalledWith({ title: 'Методичка', kind: 'document' });
    expect(mockedUpload).toHaveBeenCalledWith('m1', expect.any(File));
    expect(returned).toEqual(created);
    expect(result.current.file).toBeNull();
    expect(result.current.createdMaterial).toBeNull();
  });

  it('файл не выбран — create() не пытается ничего загрузить', async () => {
    const created = makeMaterial();
    const onCreate = vi.fn().mockResolvedValue(created);
    const { result } = renderHook(() => useNewMaterialFile(onCreate));

    await act(async () => {
      await result.current.create({ title: 'Методичка', kind: 'document' });
    });

    expect(mockedUpload).not.toHaveBeenCalled();
  });
});

describe('useNewMaterialFile — сбой загрузки', () => {
  it('материал запомнен в createdMaterial, брошена ошибка с текстом для человека', async () => {
    const created = makeMaterial();
    const onCreate = vi.fn().mockResolvedValue(created);
    mockedUpload.mockRejectedValue(new Error('нет сети'));
    const { result } = renderHook(() => useNewMaterialFile(onCreate));

    act(() => result.current.selectFile(makeFile()));

    let thrown: unknown;
    await act(async () => {
      try {
        await result.current.create({ title: 'Методичка', kind: 'document' });
      } catch (err) {
        thrown = err;
      }
    });

    expect(thrown).toBeInstanceOf(ApiError);
    expect((thrown as ApiError).message).toBe(UPLOAD_AFTER_CREATE_ERROR_MESSAGE);
    // Второй заход правит этот же материал (не создаёт дубль) — вызывающая
    // сторона (MaterialEditorForm.tsx) читает его отсюда и дальше зовёт
    // onUpdate, а не onCreate; здесь проверяем ровно то, что даёт ей эту
    // возможность — материал не потерян.
    expect(result.current.createdMaterial).toEqual(created);
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('setCreatedMaterial обновляет запомненный материал (повторная загрузка через MaterialFileField)', () => {
    const { result } = renderHook(() => useNewMaterialFile(vi.fn()));
    const withFile = makeMaterial({
      file: {
        name: 'Методичка.pdf',
        contentType: 'application/pdf',
        sizeBytes: 1024,
        uploadedAt: '2026-01-01T00:00:00Z',
      },
    });

    act(() => result.current.setCreatedMaterial(withFile));

    expect(result.current.createdMaterial).toEqual(withFile);
  });
});

describe('useNewMaterialFile — негодный файл при выборе', () => {
  it('неподдерживаемый формат — ошибка сразу, файл не запоминается', () => {
    const { result } = renderHook(() => useNewMaterialFile(vi.fn()));

    act(() => result.current.selectFile(makeFile('application/zip')));

    expect(result.current.fileError).toBe(MATERIAL_FILE_UNSUPPORTED_MESSAGE);
    expect(result.current.file).toBeNull();
  });

  it('материал всё равно можно создать — файла нет, upload не зовётся', async () => {
    const created = makeMaterial();
    const onCreate = vi.fn().mockResolvedValue(created);
    const { result } = renderHook(() => useNewMaterialFile(onCreate));

    act(() => result.current.selectFile(makeFile('application/zip')));
    await act(async () => {
      await result.current.create({ title: 'Методичка', kind: 'document' });
    });

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(mockedUpload).not.toHaveBeenCalled();
  });
});
