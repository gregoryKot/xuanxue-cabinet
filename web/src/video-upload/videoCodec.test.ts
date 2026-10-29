import { VIDEO_CODECS } from '@xuanxue/shared';
import { describe, expect, it } from 'vitest';
import { toVideoCodec } from './videoCodec';

describe('toVideoCodec', () => {
  it.each(VIDEO_CODECS)('%s — из списка сервера, отдаётся как есть', (codec) => {
    expect(toVideoCodec(codec)).toBe(codec);
  });

  it.each([null, undefined, '', 'prores', 'AVC', 'h264', 42])(
    '%j — вне списка, кодек не сообщаем',
    (value) => {
      expect(toVideoCodec(value)).toBeUndefined();
    },
  );
});
