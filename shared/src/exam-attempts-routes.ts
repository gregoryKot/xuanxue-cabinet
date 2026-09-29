// Записи карты маршрутов (api-routes.ts, ADR-0148) — попытка сдачи экзамена
// глазами ученика (ExamAttemptsController): старт, автосохранение, сдача,
// чтение своей попытки и очередь проверки. Ответ записи — целая попытка
// (`ExamAttemptDto`): кабинет кладёт её на экран без второго GET (ADR-0087,
// ADR-0094); `PATCH …/answers` её пока не читает, но сервер отдаёт.
// Проверка учителем (карточка, оценка) — в grading-routes.ts.
import type { AddExamMediaLinkInput, ExamMediaDto } from './exam-media';
import type {
  ExamAttemptCountDto,
  ExamAttemptDto,
  ListAttemptsQuery,
  SaveAttemptAnswersInput,
} from './exam-attempts';

export interface ExamAttemptsRoutes {
  'POST /exams/:examId/attempts': {
    query: undefined;
    body: undefined;
    response: ExamAttemptDto;
  };
  'GET /exams/:examId/attempt-count': {
    query: undefined;
    body: undefined;
    response: ExamAttemptCountDto;
  };
  'GET /attempts': {
    query: ListAttemptsQuery;
    body: undefined;
    response: ExamAttemptDto[];
  };
  'GET /attempts/:id': { query: undefined; body: undefined; response: ExamAttemptDto };
  'PATCH /attempts/:id/answers': {
    query: undefined;
    body: SaveAttemptAnswersInput;
    response: ExamAttemptDto;
  };
  'POST /attempts/:id/submit': {
    query: undefined;
    body: undefined;
    response: ExamAttemptDto;
  };
  'POST /attempts/:id/media/link': {
    query: undefined;
    body: AddExamMediaLinkInput;
    response: ExamMediaDto;
  };
}

export const EXAM_ATTEMPTS_ROUTE_KEYS: Record<keyof ExamAttemptsRoutes, true> = {
  'POST /exams/:examId/attempts': true,
  'GET /exams/:examId/attempt-count': true,
  'GET /attempts': true,
  'GET /attempts/:id': true,
  'PATCH /attempts/:id/answers': true,
  'POST /attempts/:id/submit': true,
  'POST /attempts/:id/media/link': true,
};
