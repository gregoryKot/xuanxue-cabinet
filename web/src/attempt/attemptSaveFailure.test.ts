import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ATTEMPT_EXPIRED_MESSAGE,
  ATTEMPT_NOT_IN_PROGRESS_MESSAGE,
} from '@xuanxue/shared';
import { ApiError } from '../api/http';
import { bootstrapAttemptAnswers, writeAttemptAnswerDraft } from './attemptLocalDraft';
import { applyAttemptSaveFailure } from './attemptSaveFailure';

const ATTEMPT_ID = 'attempt-1';
const RETRY_DELAY_MS = 4000;

function effects() {
  return {
    attemptId: ATTEMPT_ID,
    retryDelayMs: RETRY_DELAY_MS,
    onExpired: vi.fn(),
    scheduleRetry: vi.fn(),
  };
}

afterEach(() => {
  localStorage.clear();
});

// Аудит 2026-10-01, F44: отказ навсегда — статус `refused` с текстом сервера,
// без таймера повтора; временный сбой — `error` и повтор, как раньше.
describe('applyAttemptSaveFailure', () => {
  it('время вышло — черновик стёрт, onExpired, статус error (экран перечитает)', () => {
    writeAttemptAnswerDraft(ATTEMPT_ID, { itemId: 'i1', text: 'ответ' });
    const e = effects();

    const failure = applyAttemptSaveFailure(
      new ApiError(ATTEMPT_EXPIRED_MESSAGE, 400, 'invalid_input'),
      e,
    );

    expect(failure).toEqual({ status: 'error' });
    expect(bootstrapAttemptAnswers(ATTEMPT_ID, []).recoveredIds).toEqual([]);
    expect(e.onExpired).toHaveBeenCalledTimes(1);
    expect(e.scheduleRetry).not.toHaveBeenCalled();
  });

  it('403 заблокированному посреди попытки — refused с текстом сервера, без повтора', () => {
    const e = effects();

    const failure = applyAttemptSaveFailure(
      new ApiError('Доступ закрыт.', 403, 'forbidden'),
      e,
    );

    expect(failure).toEqual({ status: 'refused', message: 'Доступ закрыт.' });
    expect(e.onExpired).toHaveBeenCalledTimes(1);
    expect(e.scheduleRetry).not.toHaveBeenCalled();
  });

  it('«уже сдана» из другой вкладки — refused, перечитывание попытки', () => {
    const e = effects();

    const failure = applyAttemptSaveFailure(
      new ApiError(ATTEMPT_NOT_IN_PROGRESS_MESSAGE, 400, 'invalid_input'),
      e,
    );

    expect(failure.status).toBe('refused');
    expect(e.onExpired).toHaveBeenCalledTimes(1);
  });

  it('400 на самом ответе — refused с текстом, попытку не перечитываем', () => {
    const e = effects();

    const failure = applyAttemptSaveFailure(
      new ApiError('Слишком длинный ответ', 400, 'invalid_input'),
      e,
    );

    expect(failure).toEqual({ status: 'refused', message: 'Слишком длинный ответ' });
    expect(e.onExpired).not.toHaveBeenCalled();
    expect(e.scheduleRetry).not.toHaveBeenCalled();
  });

  it('5xx и сеть — error и повтор через retryDelayMs', () => {
    const e = effects();

    expect(applyAttemptSaveFailure(new Error('сеть'), e)).toEqual({ status: 'error' });
    expect(
      applyAttemptSaveFailure(new ApiError('Сервер', 500, 'internal_error'), e),
    ).toEqual({
      status: 'error',
    });
    expect(e.scheduleRetry).toHaveBeenCalledTimes(2);
    expect(e.scheduleRetry).toHaveBeenCalledWith(RETRY_DELAY_MS);
    expect(e.onExpired).not.toHaveBeenCalled();
  });
});
