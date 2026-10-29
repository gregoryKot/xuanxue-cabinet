// Сборка тяжёлых шагов «Перегнать видео» (ADR-0189) из готовых частей: проверяется
// проводка — какой адрес, какие сроки, какой кодек и транспорт, — а не сами шаги,
// у них свои тесты в video-upload/ и api/. Части подменены.
import { H264_VIDEO_CODEC } from '@xuanxue/shared';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/http';
import { fetchBlob } from '../api/fetchBlob';
import { convertVideoToH264 } from '../video-upload/convertVideoToH264';
import { probeVideoCodec } from '../video-upload/probeVideoCodec';
import { uploadVideoBlob } from '../video-upload/uploadVideoBlob';
import { POSTER_FROM_URL_TIMEOUT_MS } from '../video-upload/videoPosterPlan';
import {
  makeCodecBackfillDeps,
  VIDEO_DOWNLOAD_TIMEOUT_MS,
} from './examVideoCodecBackfillDeps';

vi.mock('../api/fetchBlob', () => ({ fetchBlob: vi.fn() }));
vi.mock('../video-upload/convertVideoToH264', () => ({ convertVideoToH264: vi.fn() }));
vi.mock('../video-upload/probeVideoCodec', () => ({ probeVideoCodec: vi.fn() }));
vi.mock('../video-upload/uploadVideoBlob', () => ({ uploadVideoBlob: vi.fn() }));

const BYTES_URL = '/api/exam-videos/a/bytes';
const signal = new AbortController().signal;

function deps() {
  return makeCodecBackfillDeps(() => Promise.resolve());
}

describe('makeCodecBackfillDeps', () => {
  it('probe читает кодек по адресу байт кабинета со сроком как у кадров', async () => {
    const probe = { codec: 'hevc', canConvert: true } as const;
    vi.mocked(probeVideoCodec).mockResolvedValue(probe);

    await expect(deps().probe('a', signal)).resolves.toBe(probe);

    expect(probeVideoCodec).toHaveBeenCalledWith(BYTES_URL, {
      signal,
      timeoutMs: POSTER_FROM_URL_TIMEOUT_MS,
    });
  });

  it('convert качает байты целиком со своим сроком и отдаёт проверенную копию', async () => {
    const source = new Blob([new Uint8Array(3)]);
    const copy = new Blob([new Uint8Array(2)], { type: 'video/mp4' });
    vi.mocked(fetchBlob).mockResolvedValue(source);
    vi.mocked(convertVideoToH264).mockResolvedValue(copy);

    await expect(deps().convert('a', signal)).resolves.toBe(copy);

    expect(fetchBlob).toHaveBeenCalledWith(BYTES_URL, {
      signal,
      timeoutMs: VIDEO_DOWNLOAD_TIMEOUT_MS,
    });
    expect(convertVideoToH264).toHaveBeenCalledWith(source, { signal });
  });

  it('convert: отказ перегона (null) доходит как есть', async () => {
    vi.mocked(fetchBlob).mockResolvedValue(new Blob());
    vi.mocked(convertVideoToH264).mockResolvedValue(null);

    await expect(deps().convert('a', signal)).resolves.toBeNull();
  });

  it('convert: скачать не вышло — ошибка идёт наверх (по статусу прогон узнает «нет доступа»)', async () => {
    vi.mocked(fetchBlob).mockRejectedValue(new ApiError('Нет прав', 403, 'forbidden'));
    vi.mocked(convertVideoToH264).mockClear();

    await expect(deps().convert('a', signal)).rejects.toMatchObject({ status: 403 });

    expect(convertVideoToH264).not.toHaveBeenCalled();
  });

  it('upload грузит копию новым видео вопроса, с avc и общей паузой повтора', async () => {
    const waitForResume = () => Promise.resolve();
    const uploaded = { id: 'new', sizeBytes: 2 };
    vi.mocked(uploadVideoBlob).mockResolvedValue(uploaded);
    const copy = new Blob([new Uint8Array(2)]);

    await expect(makeCodecBackfillDeps(waitForResume).upload(copy, signal)).resolves.toBe(
      uploaded,
    );

    expect(uploadVideoBlob).toHaveBeenCalledWith({
      file: copy,
      transport: expect.objectContaining({
        start: expect.any(Function) as unknown,
        complete: expect.any(Function) as unknown,
      }) as unknown,
      signal,
      waitForResume,
      codec: H264_VIDEO_CODEC,
    });
  });
});
