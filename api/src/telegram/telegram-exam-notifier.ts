// Реализация ExamNotifier поверх бота (слой 4.7, docs/PLAN.md §11):
// «работу сдали» — всем учителям/помощникам с включённым видом
// `attempt_submitted` (PersonalChats.listFor, тот же приём, что
// TelegramTeacherNotifier); «работу проверили» — тому самому ученику, если у
// него есть личный чат и включён `exam_result` (PersonalChats.chatFor).
// Тексты — отдельными чистыми модулями (attempt-submitted-message.ts,
// exam-graded-message.ts). Отправка — best-effort: сбой (в т.ч. Mongo при
// резолве имени/чата) ловится здесь и уходит в Logger.warn, не наружу
// (CLAUDE.md «Логи», «Ошибки») — вызывающий сервис (ExamAttemptsService/
// ExamGradingsService) не должен падать или ждать бота.
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DateTime } from 'luxon';
import { errorMessage } from '../common/error-info';
import { UserNamesService } from '../users/user-names.service';
import { attemptSubmittedMessage } from './attempt-submitted-message';
import { examGradedMessage } from './exam-graded-message';
import type {
  AttemptSubmittedContext,
  ExamGradedContext,
  ExamNotifier,
} from '../exams/exam-notifier';
import { PersonalChats } from './personal-chats';
import { TelegramBotService } from './telegram-bot.service';

@Injectable()
export class TelegramExamNotifier implements ExamNotifier {
  private readonly logger = new Logger(TelegramExamNotifier.name);

  constructor(
    private readonly personalChats: PersonalChats,
    private readonly userNamesService: UserNamesService,
    private readonly bot: TelegramBotService,
    private readonly config: ConfigService,
  ) {}

  async notifyAttemptSubmitted(
    context: AttemptSubmittedContext,
    now: DateTime,
  ): Promise<void> {
    try {
      const chats = await this.personalChats.listFor('attempt_submitted', now);
      if (chats.length === 0) return;

      const names = await this.userNamesService.namesByIds([context.userId]);
      const studentName = names.get(context.userId) ?? 'Ученик';
      const text = attemptSubmittedMessage(
        studentName,
        context.examTitle,
        context.attemptId,
        this.config.get<string>('PUBLIC_URL'),
      );
      await Promise.all(chats.map((chat) => this.bot.sendMessage(chat.chatId, text)));
    } catch (err) {
      this.logger.warn(`exam.notifyAttemptSubmitted: ${errorMessage(err)}`, {
        attemptId: context.attemptId,
      });
    }
  }

  // `now` не используется (нет ни дедлайна, ни throttling у этого
  // сообщения) — параметр остаётся ради интерфейса ExamNotifier и вызывающих
  // сервисов, которые уже держат `now` под рукой (CLAUDE.md «Время»: не
  // заводить свой DateTime.utc() здесь только ради его отсутствия).
  async notifyExamGraded(context: ExamGradedContext, _now: DateTime): Promise<void> {
    try {
      const chat = await this.personalChats.chatFor(context.userId, 'exam_result');
      if (!chat) return;

      const text = examGradedMessage(
        context.examTitle,
        context.outcome,
        context.comment,
        this.config.get<string>('PUBLIC_URL'),
      );
      await this.bot.sendMessage(chat.chatId, text);
    } catch (err) {
      this.logger.warn(`exam.notifyExamGraded: ${errorMessage(err)}`, {
        attemptId: context.attemptId,
      });
    }
  }
}
