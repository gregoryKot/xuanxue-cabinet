// Файл грузит общий загрузчик (video-upload/useVideoUpload.ts); здесь —
// подключение к нему поля видео вопроса: что уходит в форму по готовности,
// потолок 50 МБ, отмена, ссылка без R2. Сеть — фейковый транспорт, подставленный
// вместо examVideoTransport (маршруты — examVideoTransport.test.ts), так что
// ни сети, ни `mockResolvedValueOnce` (check-once-mock-ratchet.mjs).
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EXAM_VIDEO_LIMITS, EXAM_VIDEO_TOO_LARGE_MESSAGE } from '@xuanxue/shared';
import { ApiError } from '../api/apiError';
import { makeFakeTransport } from '../test-support/fakeVideoTransport';
import { useExamVideoField } from './useExamVideoField';

// vi.mock поднимается выше импортов, поэтому транспорт передаётся через
// vi.hoisted: тест кладёт его перед каждым прогоном.
const holder = vi.hoisted((): { transport: unknown } => ({ transport: undefined }));
vi.mock('./examVideoTransport', () => ({ examVideoTransport: () => holder.transport }));

const FILE = new File([new Uint8Array(20)], 'clip.mp4', { type: 'video/mp4' });

function useFakeTransport(overrides: Parameters<typeof makeFakeTransport>[0] = {}) {
  const transport = makeFakeTransport(overrides);
  holder.transport = transport;
  return transport;
}

describe('useExamVideoField — загрузка файла', () => {
  it('успех — onChange получает videoId готового видео, поле в покое', async () => {
    const transport = useFakeTransport();
    const onChange = vi.fn();
    const { result } = renderHook(() => useExamVideoField(onChange));

    act(() => result.current.uploadFile(FILE));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ videoId: 'm1' }));
    expect(transport.start).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
    expect(result.current.upload.phase).toBe('done');
  });

  it('пока файл грузится — фаза uploading, onChange ещё не зовётся', () => {
    useFakeTransport({ start: () => new Promise(() => {}) });
    const onChange = vi.fn();
    const { result } = renderHook(() => useExamVideoField(onChange));

    act(() => result.current.uploadFile(FILE));

    expect(result.current.upload.phase).toBe('uploading');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('файл больше 50 МБ — сразу отказ прежним текстом, в сеть не ходит', () => {
    const transport = useFakeTransport();
    const big = new File([new Uint8Array(1)], 'big.mp4', { type: 'video/mp4' });
    Object.defineProperty(big, 'size', { value: EXAM_VIDEO_LIMITS.maxBytes + 1 });
    const onChange = vi.fn();
    const { result } = renderHook(() => useExamVideoField(onChange));

    act(() => result.current.uploadFile(big));

    expect(result.current.upload).toMatchObject({
      phase: 'failed',
      error: { message: EXAM_VIDEO_TOO_LARGE_MESSAGE },
    });
    expect(transport.start).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('отказ сервера (4xx) — его текст в upload.error, onChange не зовётся', async () => {
    useFakeTransport({
      start: () =>
        Promise.reject(
          new ApiError(
            'Такой формат не подходит. Загрузите видео в MP4, MOV или WebM.',
            400,
            'invalid_input',
          ),
        ),
    });
    const onChange = vi.fn();
    const { result } = renderHook(() => useExamVideoField(onChange));

    act(() => result.current.uploadFile(FILE));

    await waitFor(() => expect(result.current.upload.phase).toBe('failed'));
    expect(result.current.upload.error?.message).toMatch(/Такой формат не подходит/);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('«Отменить» — загрузка прерывается, видео в форму не попадает', async () => {
    const transport = useFakeTransport({ start: () => new Promise(() => {}) });
    const onChange = vi.fn();
    const { result } = renderHook(() => useExamVideoField(onChange));
    act(() => result.current.uploadFile(FILE));
    await waitFor(() => expect(transport.start).toHaveBeenCalled());

    act(() => result.current.cancelUpload());

    expect(result.current.upload.phase).toBe('cancelled');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('связь пропала — пауза, «Продолжить сейчас» доводит загрузку до конца', async () => {
    let part1Attempts = 0;
    useFakeTransport({
      uploadPart: (_uploadId, partNumber) => {
        if (partNumber === 1 && (part1Attempts += 1) === 1) {
          return Promise.reject(new ApiError('Нет связи с сервером.', 0, 'network'));
        }
        return Promise.resolve({
          id: 'u1',
          partBytes: 8,
          partCount: 3,
          receivedParts: Array.from({ length: partNumber }, (_, index) => index + 1),
        });
      },
    });
    const onChange = vi.fn();
    const { result } = renderHook(() => useExamVideoField(onChange));
    act(() => result.current.uploadFile(FILE));
    await waitFor(() => expect(result.current.upload.phase).toBe('waiting'));

    act(() => result.current.resumeUpload());

    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ videoId: 'm1' }));
  });

  it('пока файл грузится, закрытие вкладки переспрашивается (как у видео-ответа)', () => {
    useFakeTransport({ start: () => new Promise(() => {}) });
    const { result } = renderHook(() => useExamVideoField(vi.fn()));
    act(() => result.current.uploadFile(FILE));

    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
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

  it('забывает и прошлый отказ загрузки: «Убрать видео» не оставляет старую ошибку', () => {
    useFakeTransport();
    const big = new File([new Uint8Array(1)], 'big.mp4');
    Object.defineProperty(big, 'size', { value: EXAM_VIDEO_LIMITS.maxBytes + 1 });
    const { result } = renderHook(() => useExamVideoField(vi.fn()));
    act(() => result.current.uploadFile(big));
    expect(result.current.upload.phase).toBe('failed');

    act(() => result.current.clear());

    expect(result.current.upload).toMatchObject({ phase: 'idle', error: null });
  });
});
