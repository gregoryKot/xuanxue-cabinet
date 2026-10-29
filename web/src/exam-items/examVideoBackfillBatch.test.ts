import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/http';
import { isNoAccess, nextPendingBatch } from './examVideoBackfillBatch';

const signal = new AbortController().signal;
const MESSAGES = { noAccess: 'Нет доступа.', listFailed: 'Список не пришёл.' };

describe('nextPendingBatch', () => {
  it('отдаёт id из списка по порядку', async () => {
    const list = vi.fn(() => Promise.resolve([{ id: 'a' }, { id: 'b' }]));

    await expect(nextPendingBatch(list, new Set(), signal, MESSAGES)).resolves.toEqual({
      status: 'videos',
      ids: ['a', 'b'],
    });
    expect(list).toHaveBeenCalledWith(signal);
  });

  it('уже тронутые в этом прогоне отсеивает', async () => {
    const list = () => Promise.resolve([{ id: 'a' }, { id: 'b' }]);

    await expect(
      nextPendingBatch(list, new Set(['a']), signal, MESSAGES),
    ).resolves.toEqual({
      status: 'videos',
      ids: ['b'],
    });
  });

  it.each([[[]], [[{ id: 'a' }]]])(
    'нетронутых нет (список %j) — прогон дошёл до конца',
    async (videos) => {
      await expect(
        nextPendingBatch(() => Promise.resolve(videos), new Set(['a']), signal, MESSAGES),
      ).resolves.toEqual({ status: 'done' });
    },
  );

  it.each([401, 403])('%s — отказ в доступе, текст про вход', async (status) => {
    const list = () => Promise.reject(new ApiError('Нет прав', status, 'forbidden'));

    await expect(nextPendingBatch(list, new Set(), signal, MESSAGES)).resolves.toEqual({
      status: 'failed',
      message: MESSAGES.noAccess,
    });
  });

  it('сбой связи — текст про список, а не про доступ', async () => {
    const list = () => Promise.reject(new ApiError('Сеть', 0, 'network'));

    await expect(nextPendingBatch(list, new Set(), signal, MESSAGES)).resolves.toEqual({
      status: 'failed',
      message: MESSAGES.listFailed,
    });
  });

  it('сигнал отменён, пока шёл запрос, — отмена, а не сбой', async () => {
    const controller = new AbortController();
    const list = () => {
      controller.abort();
      return Promise.reject(new ApiError('Сеть', 0, 'network'));
    };

    await expect(
      nextPendingBatch(list, new Set(), controller.signal, MESSAGES),
    ).resolves.toEqual({
      status: 'cancelled',
    });
  });
});

describe('isNoAccess', () => {
  it('только 401 и 403 от API', () => {
    expect(isNoAccess(new ApiError('', 401, 'unauthorized'))).toBe(true);
    expect(isNoAccess(new ApiError('', 403, 'forbidden'))).toBe(true);
    expect(isNoAccess(new ApiError('', 404, 'not_found'))).toBe(false);
    expect(isNoAccess(new Error('403'))).toBe(false);
  });
});
