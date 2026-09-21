// Реализация ExamNotifier поверх бота (слой 4.7, docs/PLAN.md §11):
// «работу сдали» — всем учителям/помощникам с включённым видом
// `attempt_submitted` (PersonalChats.listFor, тот же приём, что
// TelegramTeacherNotifier); «работу проверили» — тому самому ученику, если у
// него есть личный чат и включён `exam_result` (PersonalChats.chatFor).
// Тексты — отдельными чистыми модулями (attempt-submitted-message.ts,
// exam-graded-message.ts). Отправка — best-effort: сбой резолва (в т.ч.
// Mongo при чтении имени/чата) ловится try/catch и уходит в Logger.warn, не
// наружу (CLAUDE.md «Логи», «Ошибки») — вызывающий сервис (ExamAttemptsService/
// ExamGradingsService) не должен падать или ждать бота. Сбой самой отправки
// (бот.sendMessage вернул `false`) — отдельная ветка (аудит 2026-09, находка
// 2): раньше он тонул внутри TelegramBotService тем же `warn`, и здесь его
// никто не видел — заблокированный бот учителя или удалённый чат ученика
// считались успешной доставкой. Если адресату уведомление в итоге не дошло —
// `error` с ключом для поиска (attemptId, вид уведомления), без PII.
// Третий случай — адресатов нет вовсе (ни у кого нет активного чата с ботом
// или вид выключен у всех): до 2026-09-17 он проходил молча — сквозной e2e
// (exam-full-flow.e2e-spec.ts) подменяет нотификатор фейком и этого не
// видел. Теперь `warn` с причиной: лента кабинета (InAppExamNotifier,
// ADR-0061) почти наверняка подхватит, но тоже отчитывается о себе сама —
// здесь честно говорим за свой канал, куда уведомление не ушло и почему.
//
// Слой 4б.5 (PLAN §12): «работу сдали» теперь несёт карточку проверки
// (ответы по вопросам, автопроверка вариантов) и кнопки «Зачёт»/«Доработать»/
// «Незачёт» — карточка та же, что `GET /attempts/:id/review`
// (ExamBotPort.loadAttemptReview, не вторая сборка), поэтому имя ученика
// берём из неё (`review.userName`) — отдельный UserNamesService здесь больше
// не нужен, он уже внутри ExamGradingsService.getReview.
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
      if (delivered.every((ok) => !ok)) {
        // Никто из адресатов не получил уведомление — тихий отказ дороже
        // всего именно здесь (CLAUDE.md «Логи»): error, не warn, чтобы не
        // потеряться среди обычных сетевых предупреждений.
        this.logger.error(
          `exam.notifyAttemptSubmitted: доставка не удалась ни одному из ${delivered.length} чатов`,
          { attemptId: context.attemptId, kind: 'attempt_submitted' },
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
