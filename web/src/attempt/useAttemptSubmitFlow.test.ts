import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { markUploadActive, resetActiveUploads } from './activeUploads';
import {
  FLUSH_ERROR_MESSAGE,
  UPLOAD_IN_PROGRESS_MESSAGE,
  useAttemptSubmitFlow,
} from './useAttemptSubmitFlow';

afterEach(() => resetActiveUploads());

describe('useAttemptSubmitFlow', () => {
  it('flush прошёл — зовётся onSubmit, ошибки нет', async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAttemptSubmitFlow(flush, onSubmit));

    await act(() => result.current.handleSubmit());

    expect(flush).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(result.current.flushError).toBeNull();
    expect(result.current.flushing).toBe(false);
  });

  it('flush упал — ошибка словами, onSubmit не зовётся', async () => {
    const flush = vi.fn().mockRejectedValue(new Error('сеть'));
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAttemptSubmitFlow(flush, onSubmit));

    await act(() => result.current.handleSubmit());

    expect(onSubmit).not.toHaveBeenCalled();
    expect(result.current.flushError).toEqual({ message: FLUSH_ERROR_MESSAGE });
    expect(result.current.flushing).toBe(false);
  });

  // Аудит 2026-10-01 (H): «Отправить» размонтировало блок загрузки видео и
  // рвало её молча.
  it('видео ещё грузится — отказ словами до flush и submit', async () => {
    markUploadActive('a1:q3', true);
    const flush = vi.fn().mockResolvedValue(undefined);
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAttemptSubmitFlow(flush, onSubmit));

    await act(() => result.current.handleSubmit());

    expect(flush).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(result.current.flushError).toEqual({ message: UPLOAD_IN_PROGRESS_MESSAGE });

    markUploadActive('a1:q3', false);
    await act(() => result.current.handleSubmit());
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(result.current.flushError).toBeNull();
  });
});
