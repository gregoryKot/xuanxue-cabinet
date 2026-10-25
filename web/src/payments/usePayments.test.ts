import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PaymentDto, PaymentsPageDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { usePayments } from './usePayments';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

function row(userId: string, overrides: Partial<PaymentDto> = {}): PaymentDto {
  return {
    userId,
    userName: `Ученик ${userId}`,
    month: '2026-09',
    status: 'unpaid',
    ...overrides,
  };
}

const SEPTEMBER: PaymentsPageDto = { month: '2026-09', rows: [row('u1'), row('u2')] };
const AUGUST: PaymentsPageDto = {
  month: '2026-08',
  rows: [row('u1', { month: '2026-08' })],
};

/** Список с месяцем стоит раньше списка без него: mockApiByPath ищет по
 * префиксу, а `/payments?` — префикс обоих. Переопределение ключа сохраняет
 * его место в порядке. */
function mockPayments(overrides: Record<string, unknown> = {}) {
  mockApiByPath({
    '/payments?month=2026-08': AUGUST,
    '/payments?': SEPTEMBER,
    ...overrides,
  });
}

async function renderLoaded() {
  const hook = renderHook(() => usePayments());
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

describe('usePayments — загрузка и месяц', () => {
  it('первый запрос без month: текущий месяц решает сервер', async () => {
    mockPayments();
    const { result } = await renderLoaded();

    expect(mockedApiFetch).toHaveBeenCalledWith('/payments?limit=200', expect.anything());
    expect(result.current.page).toEqual(SEPTEMBER);
    expect(result.current.month).toBe('2026-09');
  });

  it('selectMonth шлёт month= и показывает выбранный месяц', async () => {
    mockPayments();
    const { result } = await renderLoaded();

    await act(() => result.current.selectMonth('2026-08'));

    expect(mockedApiFetch).toHaveBeenLastCalledWith(
      '/payments?month=2026-08&limit=200',
      expect.anything(),
    );
    expect(result.current.page).toEqual(AUGUST);
    expect(result.current.month).toBe('2026-08');
  });

  it('сбой загрузки — текст ошибки, а месяц остаётся выбранным для повтора', async () => {
    mockPayments({ '/payments?month=2026-08': new Error('сеть') });
    const { result } = await renderLoaded();

    await act(() => result.current.selectMonth('2026-08'));

    expect(result.current.error).toBe('Не удалось загрузить оплаты. Попробуйте ещё раз.');
    expect(result.current.month).toBe('2026-08');
  });
});

describe('usePayments — confirm и revoke (read-after-write, ADR-0087)', () => {
  it('confirm — POST, строка заменена ответом, второго GET нет', async () => {
    const paid = row('u1', { status: 'paid', confirmedAt: '2026-09-15T10:00:00.000Z' });
    mockPayments({ '/payments/u1/2026-09/confirm': paid });
    const { result } = await renderLoaded();

    await act(() => result.current.confirm('u1', '2026-09'));

    expect(mockedApiFetch).toHaveBeenCalledTimes(2);
    expect(mockedApiFetch).toHaveBeenLastCalledWith('/payments/u1/2026-09/confirm', {
      method: 'POST',
      body: {},
    });
    expect(result.current.page?.rows).toEqual([paid, row('u2')]);
  });

  it('revoke — POST на /revoke, строка возвращается в «без оплаты»', async () => {
    const paid = row('u1', { status: 'paid' });
    mockPayments({
      '/payments/u1/2026-09/revoke': row('u1'),
      '/payments?': { month: '2026-09', rows: [paid, row('u2')] },
    });
    const { result } = await renderLoaded();

    await act(() => result.current.revoke('u1', '2026-09'));

    expect(mockedApiFetch).toHaveBeenCalledTimes(2);
    // У снятия тела нет — карта маршрутов (`body: undefined`) не даст его передать.
    expect(mockedApiFetch).toHaveBeenLastCalledWith('/payments/u1/2026-09/revoke', {
      method: 'POST',
      body: undefined,
    });
    expect(result.current.page?.rows[0]?.status).toBe('unpaid');
  });

  it('сбой записи — исключение уходит вызывающему, список не меняется', async () => {
    mockPayments({ '/payments/u1/2026-09/confirm': new Error('сбой') });
    const { result } = await renderLoaded();

    await expect(act(() => result.current.confirm('u1', '2026-09'))).rejects.toThrow(
      'сбой',
    );

    expect(result.current.page).toEqual(SEPTEMBER);
  });
});
