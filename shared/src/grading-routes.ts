// Записи карты маршрутов (api-routes.ts, ADR-0148) — проверка работ учителем:
// карточка и оценка попытки, отметка и пересылка видео, заготовки
// комментариев. `PUT /attempts/:id/grading` отдаёт карточку целиком, не голую
// оценку — так чинил #345, теперь это держит карта. `media/manual` отдаёт
// запись видео, а не карточку: кабинет перечитывает её сам (цикл в графе Nest,
// exam-media.controller.ts, ADR-0013).
import type { AttemptReviewDto, PutGradingInput } from './exam-grading';
import type { AddExamMediaManualInput, ExamMediaDto } from './exam-media';
import type {
  CreateGradingCommentPresetInput,
  GradingCommentPresetDto,
  ListGradingCommentPresetsQuery,
  UpdateGradingCommentPresetInput,
} from './grading-comment-preset';

export interface GradingRoutes {
  'GET /attempts/:id/review': {
    query: undefined;
    body: undefined;
    response: AttemptReviewDto;
  };
  'PUT /attempts/:id/grading': {
    query: undefined;
    body: PutGradingInput;
    response: AttemptReviewDto;
  };
  'POST /attempts/:id/media/manual': {
    query: undefined;
    body: AddExamMediaManualInput;
    response: ExamMediaDto;
  };
  'POST /attempts/:id/media/:mediaId/send-to-me': {
    query: undefined;
    body: undefined;
    response: void;
  };
  'GET /grading-presets': {
    query: ListGradingCommentPresetsQuery;
    body: undefined;
    response: GradingCommentPresetDto[];
  };
  'POST /grading-presets': {
    query: undefined;
    body: CreateGradingCommentPresetInput;
    response: GradingCommentPresetDto;
  };
  'PATCH /grading-presets/:id': {
    query: undefined;
    body: UpdateGradingCommentPresetInput;
    response: GradingCommentPresetDto;
  };
  'DELETE /grading-presets/:id': { query: undefined; body: undefined; response: void };
}

export const GRADING_ROUTE_KEYS: Record<keyof GradingRoutes, true> = {
  'GET /attempts/:id/review': true,
  'PUT /attempts/:id/grading': true,
  'POST /attempts/:id/media/manual': true,
  'POST /attempts/:id/media/:mediaId/send-to-me': true,
  'GET /grading-presets': true,
  'POST /grading-presets': true,
  'PATCH /grading-presets/:id': true,
  'DELETE /grading-presets/:id': true,
};
