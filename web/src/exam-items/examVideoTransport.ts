// Маршруты загрузки видео вопроса/варианта (ADR-0133, ADR-0165) для общего
// загрузчика (video-upload/): те же три вызова сервера, что у видео-ответа
// ученика, но видео принадлежит школе — без вопроса и попытки в старте. Порядок
// шагов, повтор и отмена — в загрузчике; здесь только «куда и с каким телом».
import type { ExamVideoDto } from '@xuanxue/shared';
import { apiRoute } from '../api/apiRoute';
import type { VideoUploadTransport } from '../video-upload/videoUploadTypes';

export function examVideoTransport(): VideoUploadTransport<ExamVideoDto> {
  return {
    start: ({ sizeBytes, fingerprint }, request) =>
      apiRoute('POST /exam-videos/uploads', {
        body: { sizeBytes, fingerprint },
        ...request,
      }),
    uploadPart: (uploadId, partNumber, body, request) =>
      apiRoute('PUT /exam-videos/:id/parts/:n', {
        params: { id: uploadId, n: String(partNumber) },
        body,
        ...request,
      }),
    complete: (uploadId, request) =>
      apiRoute('POST /exam-videos/:id/complete', {
        params: { id: uploadId },
        ...request,
      }),
  };
}
