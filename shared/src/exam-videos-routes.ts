// Записи карты маршрутов (api-routes.ts, ADR-0148) — видео вопросов и
// вариантов (ADR-0133): число для раздела «Экзамены» и загрузка частями
// (ADR-0165: старт → части → complete, как у видео-ответа). Прежняя загрузка
// одним сырым телом идёт через XHR с прогрессом (uploadWithProgress.ts), а не
// `apiFetch`, поэтому `POST /exam-videos` в карту не входит и уходит вместе с
// переходом web на части; `GET /exam-videos/:id` — 302 для `<video src>`.
import type { ExamVideoDto, ExamVideoStatsDto, StartExamVideoInput } from './exam-videos';
import type { RawBody } from './raw-body';
import type { VideoUploadDto } from './video-uploads';

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
    body: undefined;
    response: ExamVideoDto;
  };
}

export const EXAM_VIDEOS_ROUTE_KEYS: Record<keyof ExamVideosRoutes, true> = {
  'GET /exam-videos/stats-summary': true,
  'POST /exam-videos/uploads': true,
  'PUT /exam-videos/:id/parts/:n': true,
  'POST /exam-videos/:id/complete': true,
};
