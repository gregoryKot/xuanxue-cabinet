import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/http';
import { usePaymentRowAction } from './usePaymentRowAction';

describe('usePaymentRowAction', () => {
  it('успех — pending снят, ошибки нет', async () => {
    const { result } = renderHook(() => usePaymentRowAction());

    await act(() => result.current.run(() => Promise.resolve()));

    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('ошибка API — её текст, pending снят', async () => {
    const { result } = renderHook(() => usePaymentRowAction());

    await act(() =>
      result.current.run(() =>
        Promise.reject(
          new ApiError('Ученик не найден. Обновите список.', 404, 'not_found'),
        ),
      ),
    );

    expect(result.current.error).toBe('Ученик не найден. Обновите список.');
    expect(result.current.pending).toBe(false);
  });

  it('неизвестная ошибка — общий текст с действием', async () => {
    const { result } = renderHook(() => usePaymentRowAction());

    await act(() => result.current.run(() => Promise.reject(new Error('boom'))));

    expect(result.current.error).toBe('Не получилось сохранить. Попробуйте ещё раз.');
  });

  it('повторный запуск сбрасывает прошлую ошибку', async () => {
    const { result } = renderHook(() => usePaymentRowAction());
    await act(() => result.current.run(() => Promise.reject(new Error('boom'))));

    await act(() => result.current.run(() => Promise.resolve()));

    expect(result.current.error).toBeNull();
  });
});
