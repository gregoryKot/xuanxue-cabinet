// Записи карты маршрутов (api-routes.ts, ADR-0148) — даты занятий (ADR-0033).
// Записи редактора — общий useEntityEditor; свои действия страницы — запись и
// «отправить ссылку сейчас» (PLAN §6 п.3). Список зовут и «Планирование», и
// выбор занятия в предпросмотре шаблона — окно `from..to` либо тег; число
// раздела — сводка записей (`recording-summary`).
import type {
  AddRecordingInput,
  CreateLessonInput,
  LessonDto,
  ListLessonsQuery,
  UpdateLessonInput,
} from './lessons';
import type { LessonRecordingSummaryDto } from './lesson-recording-summary';
import type { BroadcastDto } from './broadcasts';

export interface LessonsRoutes {
  'GET /lessons': { query: ListLessonsQuery; body: undefined; response: LessonDto[] };
  'GET /lessons/recording-summary': {
    query: undefined;
    body: undefined;
    response: LessonRecordingSummaryDto;
  };
  'GET /lessons/:id': { query: undefined; body: undefined; response: LessonDto };
  'POST /lessons': { query: undefined; body: CreateLessonInput; response: LessonDto };
  'PATCH /lessons/:id': {
    query: undefined;
    body: UpdateLessonInput;
    response: LessonDto;
  };
  'DELETE /lessons/:id': { query: undefined; body: undefined; response: void };
  'POST /lessons/:id/recording': {
    query: undefined;
    body: AddRecordingInput;
    response: LessonDto;
  };
  'POST /lessons/:id/send-now': {
    query: undefined;
    body: undefined;
    response: BroadcastDto;
  };
}

export const LESSONS_ROUTE_KEYS: Record<keyof LessonsRoutes, true> = {
  'GET /lessons': true,
  'GET /lessons/recording-summary': true,
  'GET /lessons/:id': true,
  'POST /lessons': true,
  'PATCH /lessons/:id': true,
  'DELETE /lessons/:id': true,
  'POST /lessons/:id/recording': true,
  'POST /lessons/:id/send-now': true,
};
