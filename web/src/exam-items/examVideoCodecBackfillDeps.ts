// Тяжёлые шаги прогона «Перегнать видео» (ADR-0189), собранные из готовых частей:
// чтение кодека по адресу, скачивание + перегон + проверка, загрузка копии.
// Отдельно от хука (useExamVideoCodecBackfill.ts): тесты хука и карточки
// подменяют именно этот модуль, потому что настоящие шаги ждут WebCodecs, а сеть
// остальных шагов — apiFetch.
import { H264_VIDEO_CODEC } from '@xuanxue/shared';
import { examVideoBytesSrc } from '../api/examVideoPaths';
import { fetchBlob } from '../api/fetchBlob';
import { convertVideoToH264 } from '../video-upload/convertVideoToH264';
import { probeVideoCodec } from '../video-upload/probeVideoCodec';
import { uploadVideoBlob } from '../video-upload/uploadVideoBlob';
import { POSTER_FROM_URL_TIMEOUT_MS } from '../video-upload/videoPosterPlan';
import type { RunCodecBackfillParams } from './examVideoCodecBackfillRunner';
import { examVideoTransport } from './examVideoTransport';

/** Скачивание ролика целиком: до 50 МБ (EXAM_VIDEO_LIMITS.maxBytes) на слабой
 * связи идёт минуты. Десять минут, как у части загрузки (videoUploadRunner.ts):
 * обрыв живого соединения ловится раньше, срок нужен молчащей сети. */
export const VIDEO_DOWNLOAD_TIMEOUT_MS = 10 * 60_000;

export type CodecBackfillDeps = Pick<
  RunCodecBackfillParams,
  'probe' | 'convert' | 'upload'
>;

export function makeCodecBackfillDeps(
  waitForResume: (delaySec: number) => Promise<void>,
): CodecBackfillDeps {
  return {
    probe: (id, signal) =>
      probeVideoCodec(examVideoBytesSrc(id), {
        signal,
        timeoutMs: POSTER_FROM_URL_TIMEOUT_MS,
      }),
    convert: async (id, signal) => {
      const source = await fetchBlob(examVideoBytesSrc(id), {
        signal,
        timeoutMs: VIDEO_DOWNLOAD_TIMEOUT_MS,
      });
      return convertVideoToH264(source, { signal });
    },
    upload: (copy, signal) =>
      uploadVideoBlob({
        file: copy,
        transport: examVideoTransport(),
        signal,
        waitForResume,
        codec: H264_VIDEO_CODEC,
      }),
  };
}
