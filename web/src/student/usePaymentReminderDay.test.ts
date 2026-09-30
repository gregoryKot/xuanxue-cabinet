// Сохранение своего дня напоминания (ADR-0160): что уходит на сервер, что
// приходит в `onSaved`, и что видит человек при ошибке. Сеть — mockApiByPath,
// не очередь `…Once` (ADR-0116).
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MyPaymentReminderDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { usePaymentReminderDay } from './usePaymentReminderDay';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const PATH = '/me/payments/reminder-day';
const SAVED: MyPaymentReminderDto = {
  dayOfMonth: 12,
  isOwnDay: true,
  schoolDayOfMonth: 5,
  time: '10:00',
};

describe('usePaymentReminderDay', () => {
  it('выбор числа → PUT с числом, ответ уходит в onSaved как есть', async () => {
    mockApiByPath({ [PATH]: SAVED });
    const onSaved = vi.fn();
    const { result } = renderHook(() => usePaymentReminderDay(onSaved));

    await act(() => result.current.choose('12'));

    expect(mockedApiFetch).toHaveBeenCalledWith(
      PATH,
      expect.objectContaining({ method: 'PUT', body: { dayOfMonth: 12 } }),
    );
    expect(onSaved).toHaveBeenCalledWith(SAVED);
    expect(result.current.error).toBeNull();
    expect(result.current.pending).toBe(false);
  });

  it('«как у школы» (пустое значение) → PUT с null', async () => {
    mockApiByPath({ [PATH]: { ...SAVED, isOwnDay: false, dayOfMonth: 5 } });
    const { result } = renderHook(() => usePaymentReminderDay(vi.fn()));

    await act(() => result.current.choose(''));

    expect(mockedApiFetch).toHaveBeenCalledWith(
      PATH,
      expect.objectContaining({ body: { dayOfMonth: null } }),
    );
  });

  it('пока запрос в пути — pending, после ответа снят', async () => {
    let resolve: (value: MyPaymentReminderDto) => void = () => undefined;
    mockedApiFetch.mockImplementation(
      () => new Promise<MyPaymentReminderDto>((done) => (resolve = done)),
    );
    const { result } = renderHook(() => usePaymentReminderDay(vi.fn()));

    let saving: Promise<void> = Promise.resolve();
    act(() => {
      saving = result.current.choose('12');
    });
    expect(result.current.pending).toBe(true);

    await act(async () => {
      resolve(SAVED);
      await saving;
    });
    expect(result.current.pending).toBe(false);
  });

  it('ошибка сервера — его текст, onSaved не зовётся; следующая попытка текст снимает', async () => {
    mockApiByPath({
      [PATH]: new ApiError(
        'Напоминания об оплате сейчас выключены школой.',
        409,
        'conflict',
      ),
    });
    const onSaved = vi.fn();
    const { result } = renderHook(() => usePaymentReminderDay(onSaved));

    await act(() => result.current.choose('12'));

    expect(result.current.error).toBe('Напоминания об оплате сейчас выключены школой.');
    expect(onSaved).not.toHaveBeenCalled();

    mockApiByPath({ [PATH]: SAVED });
    await act(() => result.current.choose('12'));

    expect(result.current.error).toBeNull();
    expect(onSaved).toHaveBeenCalledWith(SAVED);
  });

  it('ошибка без текста сервера — запасная фраза с действием', async () => {
    mockApiByPath({ [PATH]: new Error('boom') });
    const { result } = renderHook(() => usePaymentReminderDay(vi.fn()));

    await act(() => result.current.choose('12'));

    expect(result.current.error).toBe('Не удалось сохранить день. Попробуйте ещё раз.');
  });
});
