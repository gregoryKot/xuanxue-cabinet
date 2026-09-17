// Композитный ExamNotifier (слой 4.7, PLAN §11, ADR-0039) — единственный
// провайдер под токеном EXAM_NOTIFIER: зовёт Telegram и почту параллельно,
// каждый канал ловит свои сбои сам (TelegramExamNotifier/MailExamNotifier,
// комментарии в их файлах) и никогда не бросает наружу. `Promise.allSettled`
// здесь — вторая линия обороны, не первая: если один из каналов всё же
// бросит (ошибка в самом канале, не в его try/catch), другой всё равно
// получит уведомление, и сервис экзамена (ExamAttemptsService/
// ExamGradingsService) не увидит исключение ни при каком раскладе
// (CLAUDE.md «Ошибки»: доставка уведомления не роняет HTTP-ответ).
//
// Каждый канал возвращает ExamNotifyResult — число адресатов, которым
// пытался отправить (exams/exam-notifier.ts, комментарий у ExamNotifyResult).
// runBoth складывает эти числа по обоим каналам и при нуле пишет один
// `error`: учитель и ученик остались без уведомления, и это виднее одной
// строкой, чем сопоставлением warn от разных каналов.
import { Injectable, Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import type { NotificationKind } from '@xuanxue/shared';
import { errorMessage } from '../common/error-info';
import { MailExamNotifier } from '../mail/mail-exam-notifier';
import { TelegramExamNotifier } from '../telegram/telegram-exam-notifier';
import type {
  AttemptSubmittedContext,
  ExamGradedContext,
  ExamNotifier,
  ExamNotifyResult,
} from './exam-notifier';

const ATTEMPT_SUBMITTED_KIND: NotificationKind = 'attempt_submitted';
const EXAM_RESULT_KIND: NotificationKind = 'exam_result';

/** Ключи для поиска в логах Railway — без PII: ни имени, ни `userId`. */
interface NotifyLogKeys {
  attemptId: string;
  examId: string;
  kind: NotificationKind;
}

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
  ): Promise<ExamNotifyResult> {
    return this.runBoth(
      () => this.telegram.notifyAttemptSubmitted(context, now),
      () => this.mail.notifyAttemptSubmitted(context, now),
      {
        attemptId: context.attemptId,
        examId: context.examId,
        kind: ATTEMPT_SUBMITTED_KIND,
      },
    );
  }

  async notifyExamGraded(
    context: ExamGradedContext,
    now: DateTime,
  ): Promise<ExamNotifyResult> {
    return this.runBoth(
      () => this.telegram.notifyExamGraded(context, now),
      () => this.mail.notifyExamGraded(context, now),
      {
        attemptId: context.attemptId,
        examId: context.examId,
        kind: EXAM_RESULT_KIND,
      },
    );
  }

  private async runBoth(
    telegramCall: () => Promise<ExamNotifyResult>,
    mailCall: () => Promise<ExamNotifyResult>,
    keys: NotifyLogKeys,
  ): Promise<ExamNotifyResult> {
    const results = await Promise.allSettled([telegramCall(), mailCall()]);
    let recipients = 0;
    for (const result of results) {
      if (result.status === 'rejected') {
        this.logger.warn(`exam.notify (composite): ${errorMessage(result.reason)}`, keys);
        continue;
      }
      recipients += result.value.recipients;
    }
    if (recipients === 0) {
      // Ни один канал никого не уведомил — учитель без чата с ботом и без
      // почты, ученик без того и другого. Причину по каждому каналу уже
      // объяснил его собственный warn; здесь — единственная строка на сам
      // факт «никому», чтобы не собирать его из двух логов руками.
      this.logger.error('exam.notify (composite): уведомление не ушло никому', keys);
    }
    return { recipients };
  }
}
