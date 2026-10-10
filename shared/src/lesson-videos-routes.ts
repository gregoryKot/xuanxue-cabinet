// Записи карты маршрутов (api-routes.ts, ADR-0148) — запись занятия файлом
// (ADR-0180): загрузка частями, как у видео вопроса (ADR-0165): старт → части →
// complete. `GET /lesson-videos/:id` — 302 для `<video src>` — в карту не входит.
import type { LessonVideoDto, StartLessonVideoInput } from './lesson-videos';
import type { RawBody } from './raw-body';
import type { CompleteVideoUploadInput, VideoUploadDto } from './video-uploads';

export interface LessonVideosRoutes {
  'POST /lesson-videos/uploads': {
    query: undefined;
    body: StartLessonVideoInput;
    response: VideoUploadDto;
  };
  'PUT /lesson-videos/:id/parts/:n': {
    query: undefined;
    body: RawBody;
    response: VideoUploadDto;
  };
  'POST /lesson-videos/:id/complete': {
    query: undefined;
    body: CompleteVideoUploadInput;
    response: LessonVideoDto;
  };
}

export const LESSON_VIDEOS_ROUTE_KEYS: Record<keyof LessonVideosRoutes, true> = {
  'POST /lesson-videos/uploads': true,
  'PUT /lesson-videos/:id/parts/:n': true,
  'POST /lesson-videos/:id/complete': true,
};
