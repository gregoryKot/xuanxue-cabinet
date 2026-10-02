import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/http';
import {
  classifyVideoUploadError,
  videoUploadRetryDelaySeconds,
} from './videoUploadRetry';

describe('videoUploadRetryDelaySeconds', () => {
  it('расписание 2, 4, 8, 16, 30 с, дальше по 30', () => {
    expect(videoUploadRetryDelaySeconds(1)).toBe(2);
    expect(videoUploadRetryDelaySeconds(2)).toBe(4);
    expect(videoUploadRetryDelaySeconds(5)).toBe(30);
    expect(videoUploadRetryDelaySeconds(9)).toBe(30);
  });

  it('Retry-After сервера побеждает, если он больше расписания', () => {
    expect(videoUploadRetryDelaySeconds(1, 10)).toBe(10);
  });

  it('Retry-After меньше своего шага — берём своё расписание', () => {
    expect(videoUploadRetryDelaySeconds(5, 5)).toBe(30);
  });
});

describe('classifyVideoUploadError', () => {
  it('сетевой сбой (status 0) — повтор', () => {
    const err = new ApiError('Нет связи', 0, 'network');
    expect(classifyVideoUploadError(err)).toEqual({
      kind: 'retry',
      retryAfterSec: undefined,
    });
  });

  it('503 (занято) — повтор, с Retry-After сервера', () => {
    const err = new ApiError('Занято', 503, 'not_available', undefined, undefined, 10);
    expect(classifyVideoUploadError(err)).toEqual({ kind: 'retry', retryAfterSec: 10 });
  });

  // Аудит 2026-10-01: 429 считался отказом навсегда — загрузка умирала с
  // «Слишком много запросов» вместо паузы.
  it('429 — повтор, с Retry-After сервера', () => {
    const err = new ApiError(
      'Слишком много',
      429,
      'rate_limited',
      undefined,
      undefined,
      60,
    );
    expect(classifyVideoUploadError(err)).toEqual({ kind: 'retry', retryAfterSec: 60 });
  });

  it('5xx — повтор', () => {
    const err = new ApiError('Сбой', 500, 'unknown');
    expect(classifyVideoUploadError(err)).toEqual({
      kind: 'retry',
      retryAfterSec: undefined,
    });
  });

  it('4xx — стоп с текстом сервера', () => {
    const err = new ApiError('Файл, кажется, изменился', 400, 'invalid_input');
    expect(classifyVideoUploadError(err)).toEqual({
      kind: 'stop',
      message: 'Файл, кажется, изменился',
    });
  });

  it('не ApiError — повтор (сбой вне apiFetch не должен обрывать загрузку)', () => {
    expect(classifyVideoUploadError(new Error('boom'))).toEqual({ kind: 'retry' });
  });
});
