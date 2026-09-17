// jsdom не реализует canvas и createImageBitmap (CLAUDE.md «Тесты» —
// мокаем явно, не тянем canvas-полифилл ради теста, CLAUDE.md «Зависимости»:
// предпочитаем встроенное). `getContext`/`toBlob` — на прототипе
// HTMLCanvasElement, `createImageBitmap` — глобальная функция.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EXAM_IMAGE_LIMITS,
  EXAM_IMAGE_TOO_LARGE_MESSAGE,
  EXAM_IMAGE_UNSUPPORTED_MESSAGE,
} from '@xuanxue/shared';
import { EXAM_IMAGE_MAX_SIDE_PX, fitWithin, prepareExamImage } from './examImageFile';

function makeFile(type: string, size: number): File {
  return new File([new Uint8Array(size)], 'photo.jpg', { type });
}

/** Подменяет `createImageBitmap` битмапом заданного размера; возвращает мок
 * `close()`, чтобы проверить, что он вызван (утечка decoder-ресурса). */
function stubBitmap(width: number, height: number): ReturnType<typeof vi.fn> {
  const close = vi.fn();
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width, height, close }));
  return close;
}

function stubFailingDecode(): void {
  vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('unsupported')));
}

/** Подменяет `getContext`/`toBlob` на прототипе — jsdom не рисует, но
 * `drawImage` и результат `toBlob` нужно и вызвать, и проверить аргументы. */
function stubCanvas(result: Blob | null): ReturnType<typeof vi.fn> {
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
    (callback: BlobCallback) => callback(result),
  );
  return drawImage;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fitWithin', () => {
  it('длинная сторона больше maxSide — уменьшает пропорционально (альбомная)', () => {
    expect(fitWithin(2000, 1000, 1000)).toEqual({ width: 1000, height: 500 });
  });

  it('длинная сторона меньше maxSide — возвращает как есть', () => {
    expect(fitWithin(400, 300, 1000)).toEqual({ width: 400, height: 300 });
  });

  it('длинная сторона равна maxSide — возвращает как есть', () => {
    expect(fitWithin(1000, 500, 1000)).toEqual({ width: 1000, height: 500 });
  });

  it('портретная ориентация — уменьшает по высоте, округляет ширину, не меньше 1', () => {
    expect(fitWithin(1000, 3000, 1280)).toEqual({ width: 427, height: 1280 });
  });
});

describe('prepareExamImage — файл уже подходит', () => {
  it('маленький файл допустимого типа — возвращается как есть, canvas не трогаем', async () => {
    stubBitmap(400, 300);
    const drawImage = stubCanvas(null);
    const file = makeFile('image/jpeg', 1000);

    await expect(prepareExamImage(file)).resolves.toBe(file);
    expect(drawImage).not.toHaveBeenCalled();
  });
});

describe('prepareExamImage — ужатие', () => {
  it('длинная сторона больше лимита — рисует на canvas с размерами из fitWithin', async () => {
    const close = stubBitmap(2000, 1000);
    const resized = new Blob([new Uint8Array(500)], { type: 'image/jpeg' });
    const drawImage = stubCanvas(resized);
    const file = makeFile('image/jpeg', 2_000_000);

    const result = await prepareExamImage(file);
    const { width, height } = fitWithin(2000, 1000, EXAM_IMAGE_MAX_SIDE_PX);

    expect(result).toBe(resized);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, width, height);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('нет 2d-контекста canvas — UNSUPPORTED, тот же текст, что у формата', async () => {
    stubBitmap(2000, 1000);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const file = makeFile('image/jpeg', 2_000_000);

    await expect(prepareExamImage(file)).rejects.toThrow(EXAM_IMAGE_UNSUPPORTED_MESSAGE);
  });

  it('исходный файл больше лимита байт, хотя сторона в пределах — тоже ужимается', async () => {
    stubBitmap(400, 300);
    const resized = new Blob([new Uint8Array(500)], { type: 'image/jpeg' });
    const drawImage = stubCanvas(resized);
    const file = makeFile('image/jpeg', EXAM_IMAGE_LIMITS.maxBytes + 1);

    await expect(prepareExamImage(file)).resolves.toBe(resized);
    expect(drawImage).toHaveBeenCalled();
  });

  it('результат ужатия всё ещё больше лимита — TOO_LARGE', async () => {
    stubBitmap(2000, 1000);
    const stillBig = new Blob([new Uint8Array(EXAM_IMAGE_LIMITS.maxBytes + 1)]);
    stubCanvas(stillBig);
    const file = makeFile('image/jpeg', 2_000_000);

    await expect(prepareExamImage(file)).rejects.toThrow(EXAM_IMAGE_TOO_LARGE_MESSAGE);
  });

  it('canvas.toBlob не дал результата — TOO_LARGE (нечего отправлять)', async () => {
    stubBitmap(2000, 1000);
    stubCanvas(null);
    const file = makeFile('image/jpeg', 2_000_000);

    await expect(prepareExamImage(file)).rejects.toThrow(EXAM_IMAGE_TOO_LARGE_MESSAGE);
  });
});

describe('prepareExamImage — декодировать не удалось', () => {
  it('тип допустимый и размер в пределах лимита — возвращает исходный файл', async () => {
    stubFailingDecode();
    const file = makeFile('image/webp', 1000);

    await expect(prepareExamImage(file)).resolves.toBe(file);
  });

  it('тип не из EXAM_IMAGE_CONTENT_TYPES — UNSUPPORTED', async () => {
    stubFailingDecode();
    const file = makeFile('image/heic', 1000);

    await expect(prepareExamImage(file)).rejects.toThrow(EXAM_IMAGE_UNSUPPORTED_MESSAGE);
  });

  it('тип допустимый, но файл больше лимита — UNSUPPORTED, не молчаливая загрузка', async () => {
    stubFailingDecode();
    const file = makeFile('image/jpeg', EXAM_IMAGE_LIMITS.maxBytes + 1);

    await expect(prepareExamImage(file)).rejects.toThrow(EXAM_IMAGE_UNSUPPORTED_MESSAGE);
  });
});
