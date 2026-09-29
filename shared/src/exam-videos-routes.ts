// Записи карты маршрутов (api-routes.ts, ADR-0148) — видео вопросов и
// вариантов (ADR-0133): число для раздела «Экзамены». Загрузка идёт через
// XHR с прогрессом (uploadWithProgress.ts), а не `apiFetch`, поэтому
// `POST /exam-videos` в карту не входит; `GET /exam-videos/:id` — 302 для
// `<video src>`.
import type { ExamVideoStatsDto } from './exam-videos';

export interface ExamVideosRoutes {
  'GET /exam-videos/stats-summary': {
    query: undefined;
    body: undefined;
    response: ExamVideoStatsDto;
  };
}

export const EXAM_VIDEOS_ROUTE_KEYS: Record<keyof ExamVideosRoutes, true> = {
  'GET /exam-videos/stats-summary': true,
};
