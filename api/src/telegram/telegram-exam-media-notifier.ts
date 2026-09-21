// Реализация ExamMediaNotifierPort поверх бота (ADR-0084 — ссылка теперь
// основной путь ответа на видео-вопрос, значит молчание о ней стало тихим
// отказом, CLAUDE.md «Логи»). Адресаты — тот же пул, что у пересылки видео
// из бота (exam-media-forward.ts, PersonalChats.listFor('attempt_submitted',
// …)): кто выключил этот вид, не получает и ссылку; админ его не получает по
// дефолту роли (shared/src/notifications.ts). Текст — link-attached-message.ts,
// чистая функция с юнит-тестом. Кладёт себя в ExamMediaNotifierRegistry
// (api/src/media/) при подъёме TelegramModule — тот же приём, что
// ExamBotService у ExamBotPortRegistry (комментарий там же — почему не
// обычный экспорт/импорт модуля, цикл MediaModule ↔ TelegramModule).
//
// LinkAttachedContext не несёт имени ученика — только userId
// (exam-media-notifier.port.ts) — резолвим здесь через UsersService,
// доступный TelegramModule через UsersModule; у MediaModule такой
// зависимости нет и заводить её ради одной строки текста незачем. Отправка —
// best-effort: сбой резолва и сама отправка не пробрасываются наружу
// (CLAUDE.md «Ошибки») — вызывающий код (notifyLinkAttached, media/) ловит
// исключение из этого метода сам, здесь защита не дублируется.
import { Injectable, Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import {
  ExamMediaNotifierRegistry,
  type ExamMediaNotifierPort,
  type LinkAttachedContext,
} from '../media/exam-media-notifier.port';
import { UsersService } from '../users/users.service';
import { linkAttachedMessage } from './link-attached-message';
import { PersonalChats } from './personal-chats';
import { TelegramBotService } from './telegram-bot.service';

// Резолв студента по userId не нашёл запись (аккаунт удалили между записью
// ссылки и отправкой уведомления) — редкая гонка, но сообщение всё равно
// должно уйти: подставляем родовое имя вместо падения на пустом месте.
const DEFAULT_STUDENT_NAME = 'Ученик';

@Injectable()
export class TelegramExamMediaNotifier implements ExamMediaNotifierPort {
  private readonly logger = new Logger(TelegramExamMediaNotifier.name);

  constructor(
    private readonly personalChats: PersonalChats,
    private readonly usersService: UsersService,
    private readonly bot: TelegramBotService,
    registry: ExamMediaNotifierRegistry,
  ) {
    registry.set(this);
  }

  async notifyLinkAttached(context: LinkAttachedContext, now: DateTime): Promise<void> {
    const chats = await this.personalChats.listFor('attempt_submitted', now);
    if (chats.length === 0) return; // пустой список — свой warn раз в час внутри PersonalChats

    const student = await this.usersService.findById(context.userId);
    const text = linkAttachedMessage(student?.name ?? DEFAULT_STUDENT_NAME, context);
    const delivered = await Promise.all(
      chats.map((chat) => this.bot.sendMessage(chat.chatId, text)),
    );
    if (delivered.every((ok) => !ok)) {
      // Тихий отказ дороже всего именно здесь (CLAUDE.md «Логи») — error, не
      // warn, чтобы не потеряться среди обычных сетевых предупреждений.
      this.logger.error(
        `media.notifyLinkAttached: доставка не удалась ни одному из ${delivered.length} чатов`,
        { attemptId: context.attemptId, kind: 'attempt_submitted' },
      );
    }
  }
}
