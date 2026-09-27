import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/apiError';
import { uploadWithProgress } from '../api/uploadWithProgress';
import { useExamVideoField } from './useExamVideoField';

// Мок отдельного модуля, не apiFetch: mockApiByPath (test-support) заточен
// под сеть apiFetch, а видео грузится через отдельную функцию с прогрессом.
vi.mock('../api/uploadWithProgress', () => ({ uploadWithProgress: vi.fn() }));
const mockedUploadWithProgress = vi.mocked(uploadWithProgress);

const FILE = new File([new Uint8Array(4)], 'clip.mp4', { type: 'video/mp4' });

describe('useExamVideoField — загрузка файла', () => {
  it('успех — POST на /exam-videos, onChange получает videoId', async () => {
    mockedUploadWithProgress.mockResolvedValue({
      id: 'vid1',
      contentType: 'video/mp4',
      sizeBytes: 4,
      createdAt: '2026-09-27T10:00:00.000Z',
    });
    const onChange = vi.fn();
    const { result } = renderHook(() => useExamVideoField(onChange));

    await act(async () => {
      await result.current.uploadFile(FILE);
    });

    expect(mockedUploadWithProgress).toHaveBeenCalledWith(
      '/exam-videos',
      expect.objectContaining({ method: 'POST', body: FILE }),
    );
    expect(onChange).toHaveBeenCalledWith({ videoId: 'vid1' });
    expect(result.current.error).toBeNull();
    expect(result.current.uploadPending).toBe(false);
  });

  it('pending — true во время запроса, false после; прогресс доходит в uploadProgress', async () => {
    let onProgress: ((fraction: number) => void) | undefined;
    let resolveUpload: (value: unknown) => void = () => undefined;
    mockedUploadWithProgress.mockImplementation((_path, init) => {
      onProgress = init.onProgress;
      return new Promise((resolve) => (resolveUpload = resolve));
    });
    const { result } = renderHook(() => useExamVideoField(vi.fn()));

    let uploadPromise!: Promise<void>;
    act(() => {
      uploadPromise = result.current.uploadFile(FILE);
    });
    await waitFor(() => expect(result.current.uploadPending).toBe(true));
    expect(result.current.uploadProgress).toBeNull();

    act(() => onProgress?.(0.42));
    expect(result.current.uploadProgress).toBe(0.42);

    await act(async () => {
      resolveUpload({
        id: 'vid1',
        contentType: 'video/mp4',
        sizeBytes: 4,
        createdAt: '2026-09-27T10:00:00.000Z',
      });
      await uploadPromise;
    });

    expect(result.current.uploadPending).toBe(false);
    // Сброшен после завершения — следующая загрузка не наследует чужой процент.
    expect(result.current.uploadProgress).toBeNull();
  });

  it('503 — R2 не подключён, текст сервера в error, onChange не зовётся', async () => {
    mockedUploadWithProgress.mockRejectedValue(
      new ApiError('Загрузка файлов не подключена.', 503, 'unknown'),
    );
    const onChange = vi.fn();
    const { result } = renderHook(() => useExamVideoField(onChange));

    await act(async () => {
      await result.current.uploadFile(FILE);
    });

    expect(onChange).not.toHaveBeenCalled();
    expect(result.current.error).toBe('Загрузка файлов не подключена.');
  });

  it('брошено не-Error значение — запасной текст, не «undefined»', async () => {
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- нарочно не-Error: тест бьёт по ветке `err instanceof Error === false`.
    mockedUploadWithProgress.mockImplementation(() => Promise.reject('не Error'));
    const { result } = renderHook(() => useExamVideoField(vi.fn()));

    await act(async () => {
      await result.current.uploadFile(FILE);
    });

    expect(result.current.error).toBe('Не удалось загрузить видео. Попробуйте ещё раз.');
  });
});

describe('useExamVideoField — ссылка', () => {
  it('валидная https-ссылка — onChange получает videoUrl, поле очищается', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useExamVideoField(onChange));

    act(() => result.current.setUrlDraft('https://youtu.be/x'));
    act(() => result.current.commitUrl());

    expect(onChange).toHaveBeenCalledWith({ videoUrl: 'https://youtu.be/x' });
    expect(result.current.urlDraft).toBe('');
    expect(result.current.error).toBeNull();
  });

  it('невалидная ссылка — ошибка под полем, onChange не зовётся, черновик остаётся', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useExamVideoField(onChange));

    act(() => result.current.setUrlDraft('http://youtu.be/x'));
    act(() => result.current.commitUrl());

    expect(onChange).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/https:\/\//);
    expect(result.current.urlDraft).toBe('http://youtu.be/x');
  });
});

describe('useExamVideoField — clear', () => {
  it('снимает видео через onChange({}) и сбрасывает ошибку/черновик', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useExamVideoField(onChange));

    act(() => result.current.setUrlDraft('http://плохая'));
    act(() => result.current.commitUrl());
    expect(result.current.error).not.toBeNull();

    act(() => result.current.clear());

    expect(onChange).toHaveBeenCalledWith({});
    expect(result.current.error).toBeNull();
    expect(result.current.urlDraft).toBe('');
  });
});
