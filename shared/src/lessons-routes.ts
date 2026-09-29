// Записи карты маршрутов (api-routes.ts, ADR-0148) — даты занятий (ADR-0033).
// Записи редактора — общий useEntityEditor; свои действия страницы — запись и
// «отправить ссылку сейчас» (PLAN §6 п.3).
import type {
  AddRecordingInput,
  CreateLessonInput,
  LessonDto,
  UpdateLessonInput,
} from './lessons';
import type { BroadcastDto } from './broadcasts';

export interface LessonsRoutes {
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
  'GET /lessons/:id': true,
  'POST /lessons': true,
  'PATCH /lessons/:id': true,
  'DELETE /lessons/:id': true,
  'POST /lessons/:id/recording': true,
  'POST /lessons/:id/send-now': true,
};
