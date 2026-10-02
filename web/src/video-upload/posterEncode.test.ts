import { describe, expect, it, vi } from 'vitest';
import { VIDEO_POSTER_LIMITS } from '@xuanxue/shared';
import { encodePoster, type PosterCanvas } from './posterEncode';

/** Обычный холст: `toBlob` отдаёт JPEG заданного размера по порядку вызовов. */
function canvasWithSizes(sizes: number[]) {
  const qualities: number[] = [];
  const toBlob = vi.fn((callback: BlobCallback, _type?: string, quality?: unknown) => {
    qualities.push(Number(quality));
    const size = sizes[qualities.length - 1] ?? 0;
    callback(size > 0 ? new Blob([new Uint8Array(size).fill(1)]) : null);
  });
  return { canvas: { toBlob } as unknown as PosterCanvas, qualities, toBlob };
}

const SMALL = 3;
const TOO_BIG = VIDEO_POSTER_LIMITS.maxBytes + 1;

describe('encodePoster', () => {
  it('JPEG в base64 без префикса data:', async () => {
    const { canvas, toBlob } = canvasWithSizes([SMALL]);

    expect(await encodePoster(canvas)).toBe('AQEB');
    expect(toBlob.mock.calls[0]?.[1]).toBe('image/jpeg');
  });

  it('больше потолка сервера — один повтор с меньшим качеством', async () => {
    const { canvas, qualities } = canvasWithSizes([TOO_BIG, SMALL]);

    expect(await encodePoster(canvas)).toBe('AQEB');
    expect(qualities).toEqual([0.8, 0.5]);
  });

  it('не влезло и на втором качестве — сдаёмся, не больше двух попыток', async () => {
    const { canvas, qualities } = canvasWithSizes([TOO_BIG, TOO_BIG]);

    expect(await encodePoster(canvas)).toBeNull();
    expect(qualities).toHaveLength(2);
  });

  it('ровно потолок проходит', async () => {
    const { canvas } = canvasWithSizes([VIDEO_POSTER_LIMITS.maxBytes]);

    expect(await encodePoster(canvas)).not.toBeNull();
  });

  it('холст не отдал картинку (toBlob вернул null) — null', async () => {
    const { canvas } = canvasWithSizes([0]);

    expect(await encodePoster(canvas)).toBeNull();
  });

  it('внеэкранный холст: convertToBlob, отказ — null', async () => {
    const convertToBlob = vi.fn(() =>
      Promise.resolve(new Blob([new Uint8Array(SMALL).fill(2)])),
    );
    const offscreen = { convertToBlob } as unknown as PosterCanvas;

    expect(await encodePoster(offscreen)).toBe('AgIC');
    expect(convertToBlob).toHaveBeenCalledWith({ type: 'image/jpeg', quality: 0.8 });

    const broken = {
      convertToBlob: () => Promise.reject(new Error('нет памяти')),
    } as unknown as PosterCanvas;
    expect(await encodePoster(broken)).toBeNull();
  });

  it('браузер не смог прочитать картинку (FileReader.error) — null', async () => {
    vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function (
      this: FileReader,
    ) {
      queueMicrotask(() => {
        this.onerror?.(new ProgressEvent('error') as never);
      });
    });
    const { canvas } = canvasWithSizes([SMALL]);

    expect(await encodePoster(canvas)).toBeNull();
    vi.restoreAllMocks();
  });
});
