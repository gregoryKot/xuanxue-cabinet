// Маршруты загрузки видео-ответа ученика (ADR-0137) для общего загрузчика
// (video-upload/, ADR-0165): три вызова сервера по карте маршрутов. Порядок
// шагов, повтор и отмена — в загрузчике; здесь только «куда и с каким телом».
import type { ExamMediaDto } from '@xuanxue/shared';
import { apiRoute } from '../api/apiRoute';
import type { VideoUploadTransport } from '../video-upload/videoUploadTypes';

export function answerVideoTransport(
  attemptId: string,
  itemId: string,
): VideoUploadTransport<ExamMediaDto> {
  return {
    start: ({ sizeBytes, fingerprint }, request) =>
      apiRoute('POST /attempts/:id/answer-video', {
        params: { id: attemptId },
        body: { itemId, sizeBytes, fingerprint },
        ...request,
      }),
    uploadPart: (uploadId, partNumber, body, request) =>
      apiRoute('PUT /answer-videos/:id/parts/:n', {
        params: { id: uploadId, n: String(partNumber) },
        body,
        ...request,
      }),
    complete: (uploadId, poster, request) =>
      apiRoute('POST /answer-videos/:id/complete', {
        params: { id: uploadId },
        body: { poster },
        ...request,
      }),
  };
}
