// Реализация ExamNotifier поверх бота (слой 4.7, docs/PLAN.md §11):
// «работу сдали» — всем учителям/помощникам с включённым видом
// `attempt_submitted` (PersonalChats.listFor, тот же приём, что
// TelegramTeacherNotifier); «работу проверили» — тому самому ученику, если у
// него есть личный чат и включён `exam_result` (PersonalChats.chatFor).
// Тексты — отдельными чистыми модулями (attempt-submitted-message.ts,
// exam-graded-message.ts). Отправка — best-effort: сбой резолва (в т.ч.
// Mongo при чтении имени/чата) ловится try/catch и уходит в Logger.warn, не
// наружу (CLAUDE.md «Логи», «Ошибки»). Сбой самой отправки (бот.sendMessage
// вернул `false`, аудит 2026-09, находка 2): никому не дошло — `error`,
// части адресатов — `warn` (аудит 2026-10-01 F11: 429 от Telegram на один
// из чатов иначе проходил молча), оба с ключом для поиска (attemptId, вид
// уведомления), без PII. Адресатов нет вовсе — `warn` с причиной (2026-09-17):
// лента кабинета (InAppExamNotifier, ADR-0061) отчитывается о себе сама,
// здесь честно говорим за свой канал.
//
// Слой 4б.5 (PLAN §12): «работу сдали» несёт карточку проверки и кнопки
// «Зачёт»/«Доработать»/«Незачёт» — карточка та же, что `GET /attempts/:id/review`
// (ExamBotPort.loadAttemptReview, не вторая сборка), имя ученика берём из
// неё (`review.userName`), отдельный UserNamesService здесь не нужен.
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DateTime } from 'luxon';
import { errorMessage } from '../common/error-info';
import { attemptSubmittedMessage } from './attempt-submitted-message';
import { ExamBotPortRegistry } from './exam-bot-port.registry';
import { examGradedMessage } from './exam-graded-message';
import type {
  AttemptSubmittedContext,
  ExamGradedContext,
  ExamNotifier,
  ExamNotifyResult,
} from '../exams/exam-notifier';
import { buildGradeOutcomeButtons } from './handlers/grade-outcome-buttons';
import { PersonalChats } from './personal-chats';
import { TelegramBotService } from './telegram-bot.service';

@Injectable()
export class TelegramExamNotifier implements ExamNotifier {
  private readonly logger = new Logger(TelegramExamNotifier.name);

  constructor(
    private readonly personalChats: PersonalChats,
    private readonly examBotPorts: ExamBotPortRegistry,
    private readonly bot: TelegramBotService,
    private readonly config: ConfigService,
  ) {}

  async notifyAttemptSubmitted(
    context: AttemptSubmittedContext,
    now: DateTime,
  ): Promise<ExamNotifyResult> {
    try {
      const chats = await this.personalChats.listFor('attempt_submitted', now);
      if (chats.length === 0) {
        this.logger.warn(
          `exam.notifyAttemptSubmitted: некому отправить в Telegram — ни у одного учителя или помощника нет активного чата с ботом, или вид «работу сдали» выключен у всех`,
          {
            attemptId: context.attemptId,
            examId: context.examId,
            kind: 'attempt_submitted',
          },
        );
        return { recipients: 0 };
      }

      const review = await this.examBotPorts.get().loadAttemptReview(context.attemptId);
      if (!review) {
        // Попытка исчезла между submit() и отправкой — не наш случай в
        // обычной работе (уведомление шлётся о том же attemptId, что только
        // закрыл сервис), но защита в глубину дешевле, чем упавший тик.
        this.logger.warn(
          `exam.notifyAttemptSubmitted: попытка не найдена сразу после сдачи`,
          { attemptId: context.attemptId },
        );
        // Причину уже объяснил warn выше; ноль адресатов возвращаем явно —
        // это должен увидеть CompositeExamNotifier.
        return { recipients: 0 };
      }

      const text = attemptSubmittedMessage(review, this.config.get<string>('PUBLIC_URL'));
      const buttons = buildGradeOutcomeButtons(context.attemptId);
      const delivered = await Promise.all(
        chats.map((chat) => this.bot.sendMessage(chat.chatId, text, buttons)),
      );
      const failed = delivered.filter((ok) => !ok).length;
      const logContext = { attemptId: context.attemptId, kind: 'attempt_submitted' };
      if (failed === delivered.length) {
        // Никто из адресатов не получил уведомление — тихий отказ дороже
        // всего именно здесь (CLAUDE.md «Логи»): error, не warn, чтобы не
        // потеряться среди обычных сетевых предупреждений.
        this.logger.error(
          `exam.notifyAttemptSubmitted: доставка не удалась ни одному из ${delivered.length} чатов`,
          logContext,
        );
      } else if (failed > 0) {
        this.logger.warn(
          `exam.notifyAttemptSubmitted: доставка не удалась в ${failed} из ${delivered.length} чатов`,
          logContext,
        );
      }
      // Адресаты были (chats.length), даже если доставка не удалась — это
      // «пытались», доставку уже разобрал error выше.
      return { recipients: chats.length };
    } catch (err) {
      this.logger.warn(`exam.notifyAttemptSubmitted: ${errorMessage(err)}`, {
        attemptId: context.attemptId,
      });
      return { recipients: 0 };
    }
  }

  // `now` не используется (нет ни дедлайна, ни throttling у этого
  // сообщения) — параметр остаётся ради интерфейса ExamNotifier и вызывающих
  // сервисов, которые уже держат `now` под рукой (CLAUDE.md «Время»: не
  // заводить свой DateTime.utc() здесь только ради его отсутствия).
  async notifyExamGraded(
    context: ExamGradedContext,
    _now: DateTime,
  ): Promise<ExamNotifyResult> {
    try {
      const chat = await this.personalChats.chatFor(context.userId, 'exam_result');
      if (!chat) {
        // Тот же тихий отказ, что у «работу сдали»: ученик без чата с ботом
        // (или выключил вид) — результат в Telegram не уйдёт, пусть это будет
        // видно в логе. `userId` не пишем: attemptId достаточно, чтобы найти.
        this.logger.warn(
          `exam.notifyExamGraded: некуда отправить в Telegram — у ученика нет активного чата с ботом, или вид «результат экзамена» выключен`,
          { attemptId: context.attemptId, examId: context.examId, kind: 'exam_result' },
        );
        return { recipients: 0 };
      }

      const text = examGradedMessage(
        context.examTitle,
        context.outcome,
        context.comment,
        this.config.get<string>('PUBLIC_URL'),
      );
      const delivered = await this.bot.sendMessage(chat.chatId, text);
      if (!delivered) {
        this.logger.error(`exam.notifyExamGraded: доставка не удалась`, {
          attemptId: context.attemptId,
          kind: 'exam_result',
        });
      }
      // Адресат был, даже если бот вернул false — это «пытались», доставку
      // уже разобрал error выше.
      return { recipients: 1 };
    } catch (err) {
      this.logger.warn(`exam.notifyExamGraded: ${errorMessage(err)}`, {
        attemptId: context.attemptId,
      });
      return { recipients: 0 };
    }
  }
}
