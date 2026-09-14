// Порт к сервисам экзаменов для бота (слой 4б.2, ADR-0024) — бот становится
// вторым клиентом ExamAttemptsService/MyExamsService, но api/src/telegram не
// может импортировать api/src/exams напрямую: ExamsModule уже импортирует
// TelegramModule ради EXAM_NOTIFIER (exams.module.ts) — обратный импорт
// закольцевал бы граф модулей (import-x/no-cycle, CLAUDE.md «Слои»).
// Интерфейс живёт здесь (как EXAM_NOTIFIER — в exams/, в обратную
// сторону); реализация (ExamBotService, exams/exam-bot.service.ts) кладёт
// себя в ExamBotPortRegistry при подъёме ExamsModule — см. комментарий
// там же, почему инверсия, а не обычный импорт.
import type { DateTime } from 'luxon';
import type { AttemptAnswerDto, ExamAttemptDto, MyExamDto } from '@xuanxue/shared';
import type { UserLean } from '../users/users.service';

export interface ExamBotPort {
  listMyExams(user: UserLean, now: DateTime): Promise<MyExamDto[]>;
  startAttempt(examId: string, user: UserLean, now: DateTime): Promise<ExamAttemptDto>;
  /** `null` — чужая или несуществующая попытка (SECURITY §3: не
   * подтверждаем даже факт существования чужой работы). */
  loadOwnAttempt(
    attemptId: string,
    user: UserLean,
    now: DateTime,
  ): Promise<ExamAttemptDto | null>;
  saveAnswer(
    attemptId: string,
    user: UserLean,
    answer: AttemptAnswerDto,
    now: DateTime,
  ): Promise<ExamAttemptDto>;
  submitAttempt(
    attemptId: string,
    user: UserLean,
    now: DateTime,
  ): Promise<ExamAttemptDto>;
}
