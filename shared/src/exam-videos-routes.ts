// Записи карты маршрутов (api-routes.ts, ADR-0148) — видео вопросов и
// вариантов (ADR-0133): число для раздела «Экзамены» и загрузка частями
// (ADR-0165: старт → части → complete, как у видео-ответа). Загрузки одним
// сырым телом (`POST /exam-videos`) больше нет; `GET /exam-videos/:id` — 302
// для `<video src>` — в карту не входит.
import type { ExamVideoDto, ExamVideoStatsDto, StartExamVideoInput } from './exam-videos';
import type { RawBody } from './raw-body';
import type { CompleteVideoUploadInput, VideoUploadDto } from './video-uploads';

export interface ExamVideosRoutes {
  'GET /exam-videos/stats-summary': {
    query: undefined;
    body: undefined;
    response: ExamVideoStatsDto;
  };
  'POST /exam-videos/uploads': {
    query: undefined;
    body: StartExamVideoInput;
    response: VideoUploadDto;
  };
  'PUT /exam-videos/:id/parts/:n': {
    query: undefined;
    body: RawBody;
    response: VideoUploadDto;
  };
  'POST /exam-videos/:id/complete': {
    query: undefined;
    body: CompleteVideoUploadInput;
    response: ExamVideoDto;
  };
}

export const EXAM_VIDEOS_ROUTE_KEYS: Record<keyof ExamVideosRoutes, true> = {
  'GET /exam-videos/stats-summary': true,
  'POST /exam-videos/uploads': true,
  'PUT /exam-videos/:id/parts/:n': true,
  'POST /exam-videos/:id/complete': true,
};
