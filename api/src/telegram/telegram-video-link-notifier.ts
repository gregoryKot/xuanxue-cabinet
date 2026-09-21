// Плечо Telegram у уведомления «ученик прислал ссылку на видео» (ADR-0084).
// Отдельный провайдер, а не метод TelegramExamNotifier: тот файл уже за
// потолком в 150 строк, и храповик пускает его только вниз (CLAUDE.md
// «Храповики»), а событие здесь другое — не переход попытки в `submitted`,
// а пришедший ответ на конкретный вопрос. Тот же приём, что
// forwardExamVideoToTeachers (handlers/exam-media-forward.ts).
//
// Адресаты и разбор сбоев — те же, что у notifyAttemptSubmitted: вид
// `attempt_submitted` (кто просил сообщать о приходящих работах), пустой
// список и недоставка каждому — свои строки лога. Имя ученика берём из
// карточки проверки (`review.userName`), второго похода за именем не
// заводим. Всё best-effort: наружу не бросаем — HTTP-ответ ученику не должен
// падать из-за бота (CLAUDE.md «Ошибки»).
//
// PII в лог не идёт (CLAUDE.md «Логи»): ни ссылка, ни имя — только attemptId,
// examId и вид уведомления.
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DateTime } from 'luxon';
import { errorMessage } from '../common/error-info';
import type { VideoLinkAddedContext } from '../media/exam-media-notifier.port';
import { ExamBotPortRegistry } from './exam-bot-port.registry';
import { PersonalChats } from './personal-chats';
import { TelegramBotService } from './telegram-bot.service';
import { videoLinkAddedMessage } from './video-link-added-message';

@Injectable()
export class TelegramVideoLinkNotifier {
  private readonly logger = new Logger(TelegramVideoLinkNotifier.name);

  constructor(
    private readonly personalChats: PersonalChats,
    private readonly examBotPorts: ExamBotPortRegistry,
    private readonly bot: TelegramBotService,
    private readonly config: ConfigService,
  ) {}

  async notifyVideoLinkAdded(
    context: VideoLinkAddedContext,
    now: DateTime,
  ): Promise<void> {
    const keys = { attemptId: context.attemptId, examId: context.examId };
    try {
      const chats = await this.personalChats.listFor('attempt_submitted', now);
      if (chats.length === 0) {
        this.logger.warn(
          'некому отправить в Telegram — ни у одного учителя или помощника нет активного чата с ботом, или вид «работу сдали» выключен у всех',
          { ...keys, kind: 'attempt_submitted' },
        );
        return;
      }

      // Попытка исчезла между addLink() и отправкой — защита в глубину, тот же
      // случай, что у notifyAttemptSubmitted.
      const review = await this.examBotPorts.get().loadAttemptReview(context.attemptId);
      if (!review) {
        this.logger.warn('попытка не найдена', keys);
        return;
      }

      const text = videoLinkAddedMessage(
        {
          studentName: review.userName,
          examTitle: context.examTitle,
          questionPrompt: context.questionPrompt,
          url: context.url,
          attemptId: context.attemptId,
        },
        this.config.get<string>('PUBLIC_URL'),
      );
      const delivered = await Promise.all(
        chats.map((chat) => this.bot.sendMessage(chat.chatId, text)),
      );
      if (delivered.every((ok) => !ok)) {
        this.logger.error(`доставка не удалась ни одному из ${delivered.length} чатов`, {
          ...keys,
          kind: 'attempt_submitted',
        });
      }
    } catch (err) {
      this.logger.warn(errorMessage(err), keys);
    }
  }
}
