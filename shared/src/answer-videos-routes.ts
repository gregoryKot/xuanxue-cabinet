// Записи карты маршрутов (api-routes.ts, ADR-0148) — видео-ответ ученика,
// загрузка частями через сервер (ADR-0137): старт → части → complete, плюс
// число раздела «Экзамены». Часть уходит сырым телом байтов (RawBody), не
// JSON. Адрес плеера `GET /answer-videos/:id` — 302 на подписанную ссылку R2,
// его открывает браузер (`<video src>`), не `apiFetch`, поэтому в карте его нет.
import type {
  AnswerVideoStatsDto,
  AnswerVideoUploadDto,
  StartAnswerVideoInput,
} from './answer-videos';
import type { ExamMediaDto } from './exam-media';
import type { RawBody } from './raw-body';

export interface AnswerVideosRoutes {
  'POST /attempts/:id/answer-video': {
    query: undefined;
    body: StartAnswerVideoInput;
    response: AnswerVideoUploadDto;
  };
  'PUT /answer-videos/:id/parts/:n': {
    query: undefined;
    body: RawBody;
    response: AnswerVideoUploadDto;
  };
  'POST /answer-videos/:id/complete': {
    query: undefined;
    body: undefined;
    response: ExamMediaDto;
  };
  'GET /answer-videos/stats-summary': {
    query: undefined;
    body: undefined;
    response: AnswerVideoStatsDto;
  };
}

export const ANSWER_VIDEOS_ROUTE_KEYS: Record<keyof AnswerVideosRoutes, true> = {
  'POST /attempts/:id/answer-video': true,
  'PUT /answer-videos/:id/parts/:n': true,
  'POST /answer-videos/:id/complete': true,
  'GET /answer-videos/stats-summary': true,
};
