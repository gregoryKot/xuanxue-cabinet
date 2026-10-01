import { describe, expect, it } from 'vitest';
import {
  ATTEMPT_EXPIRED_MESSAGE,
  ATTEMPT_NOT_IN_PROGRESS_MESSAGE,
} from '@xuanxue/shared';
import { ApiError } from '../api/http';
import { classifyAttemptSaveError } from './attemptSaveError';

const RETRY_MS = 4000;

describe('classifyAttemptSaveError', () => {
  it('«время вышло» — expired', () => {
    const err = new ApiError(ATTEMPT_EXPIRED_MESSAGE, 400, 'invalid_input');
    expect(classifyAttemptSaveError(err, RETRY_MS)).toEqual({ kind: 'expired' });
  });

  it('сети нет (status 0) и 5xx — повтор через обычную паузу', () => {
    expect(
      classifyAttemptSaveError(new ApiError('Нет связи', 0, 'network'), RETRY_MS),
    ).toEqual({ kind: 'retry', delayMs: RETRY_MS });
    expect(
      classifyAttemptSaveError(new ApiError('Сбой', 502, 'http_error'), RETRY_MS),
    ).toEqual({ kind: 'retry', delayMs: RETRY_MS });
  });

  it('409 (гонка сохранений) — повтор', () => {
    const err = new ApiError('Конфликт', 409, 'conflict');
    expect(classifyAttemptSaveError(err, RETRY_MS)).toEqual({
      kind: 'retry',
      delayMs: RETRY_MS,
    });
  });

  // Нагрузочный тест аудита 2026-10-01: при минуте блокировки троттлера
  // повтор каждые 4 с — пятнадцать бесполезных запросов на ученика.
  it('429 — повтор не раньше Retry-After, если он больше обычной паузы', () => {
    const err = new ApiError(
      'Слишком много',
      429,
      'rate_limited',
      undefined,
      undefined,
      60,
    );
    expect(classifyAttemptSaveError(err, RETRY_MS)).toEqual({
      kind: 'retry',
      delayMs: 60_000,
    });
  });

  it('429 без Retry-After или с меньшим — обычная пауза', () => {
    const short = new ApiError(
      'Слишком много',
      429,
      'rate_limited',
      undefined,
      undefined,
      1,
    );
    expect(classifyAttemptSaveError(short, RETRY_MS)).toEqual({
      kind: 'retry',
      delayMs: RETRY_MS,
    });
    const none = new ApiError('Слишком много', 429, 'rate_limited');
    expect(classifyAttemptSaveError(none, RETRY_MS)).toEqual({
      kind: 'retry',
      delayMs: RETRY_MS,
    });
  });

  it('«попытка уже сдана» (другая вкладка, бот), 404 и 403 — stale: перечитать, не повторять', () => {
    const submitted = new ApiError(ATTEMPT_NOT_IN_PROGRESS_MESSAGE, 400, 'invalid_input');
    expect(classifyAttemptSaveError(submitted, RETRY_MS)).toEqual({ kind: 'stale' });
    expect(
      classifyAttemptSaveError(new ApiError('Нет', 404, 'not_found'), RETRY_MS),
    ).toEqual({
      kind: 'stale',
    });
    expect(
      classifyAttemptSaveError(new ApiError('Нет', 403, 'forbidden'), RETRY_MS),
    ).toEqual({
      kind: 'stale',
    });
  });

  it('прочие 4xx (кривой ответ) — stop: без повтора и без перечитывания', () => {
    const err = new ApiError('Слишком длинный ответ', 400, 'invalid_input');
    expect(classifyAttemptSaveError(err, RETRY_MS)).toEqual({ kind: 'stop' });
  });

  it('не ApiError — повтор', () => {
    expect(classifyAttemptSaveError(new Error('boom'), RETRY_MS)).toEqual({
      kind: 'retry',
      delayMs: RETRY_MS,
    });
  });
});
