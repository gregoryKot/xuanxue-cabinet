// Записи карты маршрутов (api-routes.ts, ADR-0148) — картинки вариантов ответа
// (ADR-0035): загрузка сырыми байтами и число для раздела «Экзамены». Адрес
// готовой картинки (`GET /exam-images/:id`) в карте не нужен: его грузит сам
// браузер через `<img src>`, а не `apiFetch`.
import type { ExamImageDto, ExamImageStatsDto } from './exam-images';
import type { RawBody } from './raw-body';

export interface ExamImagesRoutes {
  'POST /exam-images': { query: undefined; body: RawBody; response: ExamImageDto };
  'GET /exam-images/stats-summary': {
    query: undefined;
    body: undefined;
    response: ExamImageStatsDto;
  };
}

export const EXAM_IMAGES_ROUTE_KEYS: Record<keyof ExamImagesRoutes, true> = {
  'POST /exam-images': true,
  'GET /exam-images/stats-summary': true,
};
