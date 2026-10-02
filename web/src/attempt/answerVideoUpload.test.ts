import { describe, expect, it } from 'vitest';
import { ANSWER_VIDEO_LIMITS, ANSWER_VIDEO_TOO_LARGE_MESSAGE } from '@xuanxue/shared';
import { ApiError } from '../api/http';
import {
  answerVideoPartCount,
  answerVideoRetryDelaySeconds,
  answerVideoUploadProgress,
  checkAnswerVideoFileSize,
  classifyAnswerVideoError,
  nextMissingAnswerVideoPart,
  sliceAnswerVideoPart,
} from './answerVideoUpload';

function makeFile(bytes: number): File {
  return new File([new Uint8Array(bytes)], 'form.mp4', { type: 'video/mp4' });
}

describe('checkAnswerVideoFileSize', () => {
  it('пропускает файл в пределах потолка', () => {
    expect(checkAnswerVideoFileSize(ANSWER_VIDEO_LIMITS.maxBytes)).toBeNull();
  });

  it('отказывает файлу больше 1 ГБ без похода в сеть', () => {
    expect(checkAnswerVideoFileSize(ANSWER_VIDEO_LIMITS.maxBytes + 1)).toBe(
      ANSWER_VIDEO_TOO_LARGE_MESSAGE,
    );
  });
});

describe('answerVideoPartCount', () => {
  it('делит с округлением вверх', () => {
    expect(answerVideoPartCount(20, 8)).toBe(3);
    expect(answerVideoPartCount(16, 8)).toBe(2);
  });

  it('хотя бы одна часть у ненулевого файла меньше partBytes', () => {
    expect(answerVideoPartCount(3, 8)).toBe(1);
  });

  it('0 у пустого или некорректного размера', () => {
    expect(answerVideoPartCount(0, 8)).toBe(0);
  });
});

describe('sliceAnswerVideoPart', () => {
  it('режет части ровно по partBytes, последнюю — остатком', () => {
    const file = makeFile(20);
    expect(sliceAnswerVideoPart(file, 1, 8).size).toBe(8);
    expect(sliceAnswerVideoPart(file, 2, 8).size).toBe(8);
    expect(sliceAnswerVideoPart(file, 3, 8).size).toBe(4);
  });

  it('тип части — application/octet-stream, не file.type', () => {
    const file = makeFile(8);
    expect(sliceAnswerVideoPart(file, 1, 8).type).toBe('application/octet-stream');
  });
});

describe('nextMissingAnswerVideoPart', () => {
  it('первая часть для пустого receivedParts', () => {
    expect(nextMissingAnswerVideoPart(3, [])).toBe(1);
  });

  it('продолжает с первой недостающей, пропуская уже принятые', () => {
    expect(nextMissingAnswerVideoPart(3, [1])).toBe(2);
    expect(nextMissingAnswerVideoPart(3, [1, 3])).toBe(2);
  });

  it('null, когда всё уже принято', () => {
    expect(nextMissingAnswerVideoPart(3, [1, 2, 3])).toBeNull();
  });
});

describe('answerVideoUploadProgress', () => {
  it('доля от 0 до 1', () => {
    expect(answerVideoUploadProgress(0, 4)).toBe(0);
    expect(answerVideoUploadProgress(2, 4)).toBe(0.5);
    expect(answerVideoUploadProgress(4, 4)).toBe(1);
  });

  it('0 при partCount <= 0, не деление на ноль', () => {
    expect(answerVideoUploadProgress(0, 0)).toBe(0);
  });
});

describe('answerVideoRetryDelaySeconds', () => {
  it('расписание 2, 4, 8, 16, 30 с, дальше по 30', () => {
    expect(answerVideoRetryDelaySeconds(1)).toBe(2);
    expect(answerVideoRetryDelaySeconds(2)).toBe(4);
    expect(answerVideoRetryDelaySeconds(5)).toBe(30);
    expect(answerVideoRetryDelaySeconds(9)).toBe(30);
  });

  it('Retry-After сервера побеждает, если он больше расписания', () => {
    expect(answerVideoRetryDelaySeconds(1, 10)).toBe(10);
  });

  it('Retry-After меньше своего шага — берём своё расписание', () => {
    expect(answerVideoRetryDelaySeconds(5, 5)).toBe(30);
  });
});

describe('classifyAnswerVideoError', () => {
  it('сетевой сбой (status 0) — повтор', () => {
    const err = new ApiError('Нет связи', 0, 'network');
    expect(classifyAnswerVideoError(err)).toEqual({
      kind: 'retry',
      retryAfterSec: undefined,
    });
  });

  it('503 (занято) — повтор, с Retry-After сервера', () => {
    const err = new ApiError('Занято', 503, 'not_available', undefined, undefined, 10);
    expect(classifyAnswerVideoError(err)).toEqual({ kind: 'retry', retryAfterSec: 10 });
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
    expect(classifyAnswerVideoError(err)).toEqual({ kind: 'retry', retryAfterSec: 60 });
  });

  it('5xx — повтор', () => {
    const err = new ApiError('Сбой', 500, 'unknown');
    expect(classifyAnswerVideoError(err)).toEqual({
      kind: 'retry',
      retryAfterSec: undefined,
    });
  });

  it('4xx — стоп с текстом сервера', () => {
    const err = new ApiError('Файл, кажется, изменился', 400, 'invalid_input');
    expect(classifyAnswerVideoError(err)).toEqual({
      kind: 'stop',
      message: 'Файл, кажется, изменился',
    });
  });

  it('не ApiError — повтор (сбой вне apiFetch не должен обрывать загрузку)', () => {
    expect(classifyAnswerVideoError(new Error('boom'))).toEqual({ kind: 'retry' });
  });
});
