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
import type {
  AttemptAnswerDto,
  ExamAttemptDto,
  ExamImageContentType,
  MyExamDto,
} from '@xuanxue/shared';
import type { UserLean } from '../users/users.service';

/** Картинка варианта для показа в боте (слой 4б.2, ADR-0035) —
 * `telegramFileId`, если эту картинку уже отправляли раньше: кэш экономит
 * трафик на повторный показ вопроса (exam-question-album-send.ts). */
export interface BotOptionImage {
  bytes: Buffer;
  contentType: ExamImageContentType;
  telegramFileId?: string;
}

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
  /** `null` — картинки нет или она не из снимка ЭТОЙ попытки (SECURITY §3):
   * ExamImagesService.load бросает NotFoundError, здесь это деградация —
   * экран вопроса показываем всё равно, кнопки «Вариант N» работают
   * (CLAUDE.md «Ноль нагрузки на ученика»), не отказ. */
  loadOptionImage(imageId: string, user: UserLean): Promise<BotOptionImage | null>;
  /** Кэш `file_id` после удачной отправки (см. BotOptionImage) — следующий
   * показ вопроса шлёт файл строкой, не байтами. */
  rememberTelegramFileId(imageId: string, fileId: string): Promise<void>;
}
