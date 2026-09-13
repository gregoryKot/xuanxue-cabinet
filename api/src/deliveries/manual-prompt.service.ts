// Ручные каналы (docs/PLAN.md §6 «Telegram-бот для учителя»): доставка ушла
// в статус `manual` (ManualAdapter, delivery-runner) — бот присылает учителю
// готовый текст с кнопкой «Скопировал, отправил» один раз, не на каждом тике
// (условный апдейт `manualPromptedAt` ДО отправки — тот же приём, что у
// PreviewService/RecordingPromptService).
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import type { Model, Types } from 'mongoose';
import { claimOnce } from '../common/claim-once';
import { BroadcastRecord } from '../broadcasts/broadcast.schema';
import { ChannelRecord } from '../channels/channel.schema';
import { decrypt } from '../utils/encryption';
import { inlineButton } from '../telegram/callback-data';
import { PersonalChats, type PersonalChat } from '../telegram/personal-chats';
import { TelegramBotService } from '../telegram/telegram-bot.service';
import { DeliveryRecord } from './delivery.schema';

interface DueManualDelivery {
  _id: Types.ObjectId;
  broadcastId: Types.ObjectId;
  channelId: Types.ObjectId;
}

export interface ManualPromptResult {
  prompted: number;
}

// Кандидатов на тик — не «дай всё» (CLAUDE.md «API»): та же причина, что у
// RecordingPromptService — пачка ручных доставок разом не должна упереться
// в 429 Telegram, следующий тик доберёт остаток.
const PROMPT_BATCH_LIMIT = 20;

@Injectable()
export class ManualPromptService {
  private readonly logger = new Logger(ManualPromptService.name);

  constructor(
    @InjectModel(DeliveryRecord.name)
    private readonly deliveryModel: Model<DeliveryRecord>,
    @InjectModel(BroadcastRecord.name)
    private readonly broadcastModel: Model<BroadcastRecord>,
    @InjectModel(ChannelRecord.name) private readonly channelModel: Model<ChannelRecord>,
    private readonly personalChats: PersonalChats,
    private readonly bot: TelegramBotService,
  ) {}

  async prompt(now: DateTime): Promise<ManualPromptResult> {
    // Комментарий-причина различия с PreviewService — RecordingPromptService
    // (тот же приём): здесь получатель — единственный способ, которым текст
    // вообще уходит человеку (кнопка «Скопировал, отправил» — не сама
    // отправка), без него claim() без возврата навсегда потерял бы доставку.
    const chats = await this.personalChats.list(now);
    if (chats.length === 0) return { prompted: 0 };

    const due = await this.deliveryModel
      .find(
        { status: 'manual', manualPromptedAt: { $exists: false } },
        { broadcastId: 1, channelId: 1 },
      )
      .limit(PROMPT_BATCH_LIMIT)
      .lean<DueManualDelivery[]>();

    let prompted = 0;
    for (const delivery of due) {
      if (!(await claimOnce(this.deliveryModel, delivery._id, 'manualPromptedAt', now)))
        continue;
      if (await this.promptTeachers(delivery, chats)) prompted += 1;
    }
    return { prompted };
  }

  private async promptTeachers(
    delivery: DueManualDelivery,
    chats: readonly PersonalChat[],
  ): Promise<boolean> {
    const [broadcast, channel] = await Promise.all([
      this.broadcastModel
        .findById(delivery.broadcastId, { text: 1 })
        .lean<{ text: string } | null>(),
      this.channelModel
        .findById(delivery.channelId, { title: 1 })
        .lean<{ title: string } | null>(),
    ]);
    if (!broadcast || !channel) return false; // рассылка/канал удалены — слать нечего

    const text = decrypt(broadcast.text);
    if (!text) {
      this.logger.error(
        `ручная доставка ${delivery._id.toString()}: текст не расшифровался`,
      );
      return false;
    }
    const message = `Готово к публикации в «${channel.title}»:\n\n${text}`;
    const buttons = [
      [inlineButton('Скопировал, отправил', 'sent', delivery._id.toString())],
    ];

    await Promise.all(
      chats.map((chat) => this.bot.sendMessage(chat.chatId, message, buttons)),
    );
    return true;
  }
}
