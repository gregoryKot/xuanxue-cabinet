import { describe, expect, it } from 'vitest';
import { ANSWER_VIDEO_LIMITS, ANSWER_VIDEO_TOO_LARGE_MESSAGE } from '@xuanxue/shared';
import {
  checkVideoFileSize,
  nextMissingVideoPart,
  sliceVideoPart,
  videoUploadPartCount,
  videoUploadProgress,
} from './videoUploadParts';

function makeFile(bytes: number): File {
  return new File([new Uint8Array(bytes)], 'form.mp4', { type: 'video/mp4' });
}

describe('checkVideoFileSize', () => {
  it('пропускает файл в пределах потолка', () => {
    expect(
      checkVideoFileSize(
        ANSWER_VIDEO_LIMITS.maxBytes,
        ANSWER_VIDEO_LIMITS.maxBytes,
        ANSWER_VIDEO_TOO_LARGE_MESSAGE,
      ),
    ).toBeNull();
  });

  it('отказывает файлу больше 1 ГБ без похода в сеть', () => {
    expect(
      checkVideoFileSize(
        ANSWER_VIDEO_LIMITS.maxBytes + 1,
        ANSWER_VIDEO_LIMITS.maxBytes,
        ANSWER_VIDEO_TOO_LARGE_MESSAGE,
      ),
    ).toBe(ANSWER_VIDEO_TOO_LARGE_MESSAGE);
  });
});

describe('checkVideoFileSize — потолок и текст приходят параметрами', () => {
  it('у другого вида видео свой потолок и свой текст отказа', () => {
    expect(checkVideoFileSize(50, 50, 'Много.')).toBeNull();
    expect(checkVideoFileSize(51, 50, 'Много.')).toBe('Много.');
  });
});

describe('videoUploadPartCount', () => {
  it('делит с округлением вверх', () => {
    expect(videoUploadPartCount(20, 8)).toBe(3);
    expect(videoUploadPartCount(16, 8)).toBe(2);
  });

  it('хотя бы одна часть у ненулевого файла меньше partBytes', () => {
    expect(videoUploadPartCount(3, 8)).toBe(1);
  });

  it('0 у пустого или некорректного размера', () => {
    expect(videoUploadPartCount(0, 8)).toBe(0);
  });
});

describe('sliceVideoPart', () => {
  it('режет части ровно по partBytes, последнюю — остатком', () => {
    const file = makeFile(20);
    expect(sliceVideoPart(file, 1, 8).size).toBe(8);
    expect(sliceVideoPart(file, 2, 8).size).toBe(8);
    expect(sliceVideoPart(file, 3, 8).size).toBe(4);
  });

  it('тип части — application/octet-stream, не file.type', () => {
    const file = makeFile(8);
    expect(sliceVideoPart(file, 1, 8).type).toBe('application/octet-stream');
  });
});

describe('nextMissingVideoPart', () => {
  it('первая часть для пустого receivedParts', () => {
    expect(nextMissingVideoPart(3, [])).toBe(1);
  });

  it('продолжает с первой недостающей, пропуская уже принятые', () => {
    expect(nextMissingVideoPart(3, [1])).toBe(2);
    expect(nextMissingVideoPart(3, [1, 3])).toBe(2);
  });

  it('null, когда всё уже принято', () => {
    expect(nextMissingVideoPart(3, [1, 2, 3])).toBeNull();
  });
});

describe('videoUploadProgress', () => {
  it('доля от 0 до 1', () => {
    expect(videoUploadProgress(0, 4)).toBe(0);
    expect(videoUploadProgress(2, 4)).toBe(0.5);
    expect(videoUploadProgress(4, 4)).toBe(1);
  });

  it('0 при partCount <= 0, не деление на ноль', () => {
    expect(videoUploadProgress(0, 0)).toBe(0);
  });
});
