// Композитный ExamNotifier (слой 4.7, PLAN §11, ADR-0039) — единственный
// провайдер под токеном EXAM_NOTIFIER: зовёт Telegram и почту параллельно,
// каждый канал ловит свои сбои сам (TelegramExamNotifier/MailExamNotifier,
// комментарии в их файлах) и никогда не бросает наружу. `Promise.allSettled`
// здесь — вторая линия обороны, не первая: если один из каналов всё же
// бросит (ошибка в самом канале, не в его try/catch), другой всё равно
// получит уведомление, и сервис экзамена (ExamAttemptsService/
// ExamGradingsService) не увидит исключение ни при каком раскладе
// (CLAUDE.md «Ошибки»: доставка уведомления не роняет HTTP-ответ).
import { Injectable, Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import { errorMessage } from '../common/error-info';
import { MailExamNotifier } from '../mail/mail-exam-notifier';
import { TelegramExamNotifier } from '../telegram/telegram-exam-notifier';
import type {
  AttemptSubmittedContext,
  ExamGradedContext,
  ExamNotifier,
} from './exam-notifier';

@Injectable()
export class CompositeExamNotifier implements ExamNotifier {
  private readonly logger = new Logger(CompositeExamNotifier.name);

  constructor(
    private readonly telegram: TelegramExamNotifier,
    private readonly mail: MailExamNotifier,
  ) {}

  async notifyAttemptSubmitted(
    context: AttemptSubmittedContext,
    now: DateTime,
  ): Promise<void> {
    await this.runBoth(
      () => this.telegram.notifyAttemptSubmitted(context, now),
      () => this.mail.notifyAttemptSubmitted(context, now),
      context.attemptId,
    );
  }

  async notifyExamGraded(context: ExamGradedContext, now: DateTime): Promise<void> {
    await this.runBoth(
      () => this.telegram.notifyExamGraded(context, now),
      () => this.mail.notifyExamGraded(context, now),
      context.attemptId,
    );
  }

  private async runBoth(
    telegramCall: () => Promise<void>,
    mailCall: () => Promise<void>,
    attemptId: string,
  ): Promise<void> {
    const results = await Promise.allSettled([telegramCall(), mailCall()]);
    for (const result of results) {
      if (result.status === 'rejected') {
        this.logger.warn(`exam.notify (composite): ${errorMessage(result.reason)}`, {
          attemptId,
        });
      }
    }
  }
}
