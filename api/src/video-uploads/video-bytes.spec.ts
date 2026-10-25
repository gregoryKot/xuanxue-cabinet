// Разбор `Range` и заголовки ответа байтов видео (ADR-0182) — чистая логика без
// Mongo и DI. Путь целиком, с правами и потоком, — exam-videos-poster-backfill.e2e-spec.ts.
import { InvalidInputError } from '../common/errors';
import {
  VIDEO_RANGE_INVALID_MESSAGE,
  applyVideoBytesHeaders,
  parseVideoRange,
} from './video-bytes';

describe('parseVideoRange', () => {
  it('нет заголовка — undefined: объект целиком', () => {
    expect(parseVideoRange(undefined)).toBeUndefined();
  });

  it.each(['bytes=0-', 'bytes=4-11', 'bytes=7-7', 'bytes=-65536', 'bytes=0-0'])(
    'допустимая форма %s проходит как есть',
    (header) => {
      expect(parseVideoRange(header)).toBe(header);
    },
  );

  it.each([
    ['abc'],
    [''],
    ['bytes='],
    ['bytes=-'],
    ['bytes=a-b'],
    ['bytes=0-1,5-9'],
    ['bytes=1-2-3'],
    ['items=0-1'],
    [' bytes=0-1'],
    ['bytes=0-1 '],
    ['bytes=9-3'],
    ['bytes=0-12345678901234567'],
  ])('%j — InvalidInputError с текстом про часть видео', (header) => {
    expect(() => parseVideoRange(header)).toThrow(InvalidInputError);
    expect(() => parseVideoRange(header)).toThrow(VIDEO_RANGE_INVALID_MESSAGE);
  });
});

describe('applyVideoBytesHeaders', () => {
  function capture() {
    const headers: Record<string, string> = {};
    let status: number | undefined;
    return {
      res: {
        setHeader: (name: string, value: string) => (headers[name] = value),
        status: (code: number) => {
          status = code;
        },
      },
      headers,
      status: () => status,
    };
  }

  it('переносит статус, тип, длину и Content-Range R2, закрывает кеш', () => {
    const out = capture();

    applyVideoBytesHeaders(out.res, {
      status: 206,
      contentType: 'video/mp4',
      contentLength: '8',
      contentRange: 'bytes 4-11/64',
    });

    expect(out.status()).toBe(206);
    expect(out.headers).toEqual({
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, no-store',
      'Content-Type': 'video/mp4',
      'Content-Length': '8',
      'Content-Range': 'bytes 4-11/64',
    });
  });

  it('чего R2 не прислал, того на ответе нет', () => {
    const out = capture();

    applyVideoBytesHeaders(out.res, {
      status: 200,
      contentType: undefined,
      contentLength: undefined,
      contentRange: undefined,
    });

    expect(out.status()).toBe(200);
    expect(out.headers).toEqual({
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, no-store',
    });
  });
});
