// Реализация ExamVideoDeliveryPort (api/src/media/exam-video-delivery.port.ts)
// поверх TelegramBotService — ADR-0088, уточняет ADR-0023: учитель может
// запросить видео экзамена себе в бота ещё раз, не только в момент пересылки.
// Кладёт себя в ExamVideoDeliveryRegistry в onModuleInit — TelegramModule уже
// импортирует MediaModule (ради MediaAssetsService), реестр ему доступен;
// обратный импорт media/ → telegram/ закольцевал бы граф (комментарий в
// exam-video-delivery.registry.ts).
//
// resolveChatId — тот же личный чат, что PersonalChats.chatFor, но БЕЗ
// проверки вида уведомления: это действие по кнопке, учитель попросил его
// явно, переключатель «Уведомления» тут ни при чём (SECURITY §9,
// ADR-0026/0036 — активного личного чата, статус active, достаточно).
//
// Перебор методов без сохранённого типа (запись со стыка деплоя, тот же
// приём, что у itemId в ADR-0037) — до первого успеха.
import { Injectable, type OnModuleInit } from '@nestjs/common';
import type {
  ExamVideoDeliveryPort,
  SendExamVideoInput,
} from '../media/exam-video-delivery.port';
import { ExamVideoDeliveryRegistry } from '../media/exam-video-delivery.registry';
import { EXAM_VIDEO_TELEGRAM_TYPES } from '../media/media-asset.schema';
import { UsersService } from '../users/users.service';
import { PersonalChats } from './personal-chats';
import { TelegramBotService } from './telegram-bot.service';

@Injectable()
export class TelegramExamVideoDelivery implements ExamVideoDeliveryPort, OnModuleInit {
  constructor(
    private readonly telegramBotService: TelegramBotService,
    private readonly usersService: UsersService,
    private readonly personalChats: PersonalChats,
    private readonly registry: ExamVideoDeliveryRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.set(this);
  }

  async resolveChatId(userId: string): Promise<string | null> {
    const user = await this.usersService.findById(userId);
    if (!user?.telegramId || !(await this.personalChats.hasActiveChatFor(user))) {
      return null;
    }
    return String(user.telegramId);
  }

  async sendVideo(input: SendExamVideoInput): Promise<boolean> {
    const sent = input.telegramType
      ? await this.telegramBotService.sendExamVideo(
          input.chatId,
          input.fileId,
          input.telegramType,
        )
      : await this.sendByAnyType(input.chatId, input.fileId);
    if (!sent) return false;
    // Подпись — отдельным сообщением (video_note подписи не поддерживает,
    // forward-photo-with-caption.ts): сама отправка уже удалась, сбой подписи
    // не откатывает успех — тот же приём, что там.
    await this.telegramBotService.sendMessage(input.chatId, input.caption);
    return true;
  }

  private async sendByAnyType(chatId: string, fileId: string): Promise<boolean> {
    for (const type of EXAM_VIDEO_TELEGRAM_TYPES) {
      if (await this.telegramBotService.sendExamVideo(chatId, fileId, type)) return true;
    }
    return false;
  }
}
