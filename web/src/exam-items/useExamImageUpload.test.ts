import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import { mockedApiFetch, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { useExamImageUpload } from './useExamImageUpload';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

vi.mock('../lib/examImageFile', () => ({ prepareExamImage: vi.fn() }));

resetApiFetchBetweenTests();

const FILE = new File([new Uint8Array(4)], 'photo.jpg', { type: 'image/jpeg' });

async function mockedPrepare() {
  const module = await import('../lib/examImageFile');
  return vi.mocked(module.prepareExamImage);
}

describe('useExamImageUpload — успех', () => {
  it('готовит файл, грузит blob POST-ом на /exam-images, возвращает id', async () => {
    const prepareExamImage = await mockedPrepare();
    const blob = new Blob([new Uint8Array(3)], { type: 'image/jpeg' });
    prepareExamImage.mockResolvedValueOnce(blob);
    mockedApiFetch.mockResolvedValueOnce({
      id: 'img1',
      contentType: 'image/jpeg',
      sizeBytes: 3,
      createdAt: '2026-09-17T10:00:00.000Z',
    });

    const { result } = renderHook(() => useExamImageUpload());
    let id: string | null = null;
    await act(async () => {
      id = await result.current.upload(FILE);
    });

    expect(id).toBe('img1');
    expect(mockedApiFetch).toHaveBeenCalledWith('/exam-images', {
      method: 'POST',
      body: blob,
    });
    expect(result.current.error).toBeNull();
    expect(result.current.pending).toBe(false);
  });

  it('pending — true во время запроса, false после', async () => {
    const prepareExamImage = await mockedPrepare();
    prepareExamImage.mockResolvedValueOnce(new Blob());
    let resolveFetch: (value: unknown) => void = () => undefined;
    mockedApiFetch.mockReturnValueOnce(
      new Promise((resolve) => (resolveFetch = resolve)),
    );

    const { result } = renderHook(() => useExamImageUpload());
    let uploadPromise!: Promise<string | null>;
    act(() => {
      uploadPromise = result.current.upload(FILE);
    });

    await waitFor(() => expect(result.current.pending).toBe(true));

    await act(async () => {
      resolveFetch({
        id: 'img1',
        contentType: 'image/jpeg',
        sizeBytes: 0,
        createdAt: '2026-09-17T10:00:00.000Z',
      });
      await uploadPromise;
    });

    expect(result.current.pending).toBe(false);
  });
});

describe('useExamImageUpload — ошибки', () => {
  it('ApiError с сети — error = сообщение сервера, upload вернёт null', async () => {
    const prepareExamImage = await mockedPrepare();
    prepareExamImage.mockResolvedValueOnce(new Blob());
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Файл слишком большой', 413, 'payload_too_large'),
    );

    const { result } = renderHook(() => useExamImageUpload());
    let id: string | null = 'не тронуто';
    await act(async () => {
      id = await result.current.upload(FILE);
    });

    expect(id).toBeNull();
    expect(result.current.error).toBe('Файл слишком большой');
  });

  it('Error из prepareExamImage (формат/размер) — тот же текст в error, до похода в сеть', async () => {
    const prepareExamImage = await mockedPrepare();
    prepareExamImage.mockRejectedValueOnce(new Error('Такой формат не подходит.'));

    const { result } = renderHook(() => useExamImageUpload());
    let id: string | null = 'не тронуто';
    await act(async () => {
      id = await result.current.upload(FILE);
    });

    expect(id).toBeNull();
    expect(result.current.error).toBe('Такой формат не подходит.');
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('брошено не-Error значение — запасной текст, не «undefined»', async () => {
    const prepareExamImage = await mockedPrepare();
    prepareExamImage.mockRejectedValueOnce('не Error');

    const { result } = renderHook(() => useExamImageUpload());
    await act(async () => {
      await result.current.upload(FILE);
    });

    expect(result.current.error).toBe(
      'Не удалось загрузить картинку. Попробуйте ещё раз.',
    );
  });
});
