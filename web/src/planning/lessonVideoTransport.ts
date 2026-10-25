// Маршруты загрузки записи занятия (ADR-0180) для общего загрузчика
// (video-upload/, ADR-0165): те же три вызова, что у видео вопроса, но без
// вопроса и попытки — видео принадлежит школе и привязывается к записи отдельным
// шагом (`POST /lessons/:id/recording` с `videoId`). Порядок шагов, повтор и
// отмена — в загрузчике; здесь только «куда и с каким телом».
import type { LessonVideoDto } from '@xuanxue/shared';
import { apiRoute } from '../api/apiRoute';
import type { VideoUploadTransport } from '../video-upload/videoUploadTypes';

export function lessonVideoTransport(): VideoUploadTransport<LessonVideoDto> {
  return {
    start: ({ sizeBytes, fingerprint }, request) =>
      apiRoute('POST /lesson-videos/uploads', {
        body: { sizeBytes, fingerprint },
        ...request,
      }),
    uploadPart: (uploadId, partNumber, body, request) =>
      apiRoute('PUT /lesson-videos/:id/parts/:n', {
        params: { id: uploadId, n: String(partNumber) },
        body,
        ...request,
      }),
    complete: (uploadId, poster, request) =>
      apiRoute('POST /lesson-videos/:id/complete', {
        params: { id: uploadId },
        body: { poster },
        ...request,
      }),
  };
}
