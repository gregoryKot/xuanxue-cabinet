// Четвёртый шаг тика (docs/PLAN.md §6 «Telegram-бот для учителя»): за
// PREVIEW_MINUTES до отправки бот шлёт учителю текст поста с кнопками
// «Отменить»/«Изменить тему» — broadcast к этому моменту уже создан
// (BroadcastPlannerService, окно расширено на те же PREVIEW_MINUTES в
// decideBroadcast). `previewSentAt` ставится условным апдейтом ДО отправки:
// дубли при двух инстансах исключены; отправка упала — лог, повтор не нужен,
// сама рассылка всё равно уйдёт по расписанию (delivery-runner).
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import type { Model, Types } from 'mongoose';
import { PREVIEW_MINUTES } from '@xuanxue/shared';
import { decrypt } from '../utils/encryption';
import { inlineButton } from '../telegram/callback-data';
import { TeacherChats } from '../telegram/teacher-chats';
import { TelegramBotService } from '../telegram/telegram-bot.service';
import { BroadcastRecord } from './broadcast.schema';

interface DuePreview {
  _id: Types.ObjectId;
  lessonId?: Types.ObjectId;
  text: string;
}

export interface PreviewResult {
  sent: number;
}

@Injectable()
export class PreviewService {
  private readonly logger = new Logger(PreviewService.name);

  constructor(
    @InjectModel(BroadcastRecord.name)
    private readonly broadcastModel: Model<BroadcastRecord>,
    private readonly teacherChats: TeacherChats,
    private readonly bot: TelegramBotService,
  ) {}

  async sendPending(now: DateTime): Promise<PreviewResult> {
    const due = await this.broadcastModel
      .find(
        {
          kind: 'lesson_link',
          status: 'scheduled',
          previewSentAt: { $exists: false },
          scheduledAt: { $lte: now.plus({ minutes: PREVIEW_MINUTES }).toJSDate() },
        },
        { lessonId: 1, text: 1 },
      )
      .lean<DuePreview[]>();

    let sent = 0;
    for (const broadcast of due) {
      if (await this.claim(broadcast._id, now)) {
        await this.sendToTeachers(broadcast, now);
        sent += 1;
      }
    }
    return { sent };
  }

  /** `modifiedCount === 1` — этот вызов реально «забрал» рассылку; второй
   * инстанс/тик увидит `previewSentAt` уже занятым и не пришлёт дубль. */
  private async claim(id: Types.ObjectId, now: DateTime): Promise<boolean> {
    const { modifiedCount } = await this.broadcastModel.updateOne(
      { _id: id, previewSentAt: { $exists: false } },
      { $set: { previewSentAt: now.toJSDate() } },
    );
    return modifiedCount === 1;
  }

  /** `TelegramBotService.sendMessage` сама глотает сбой сети (warn в лог) —
   * здесь только «нечем послать» (текст не расшифровался). */
  private async sendToTeachers(broadcast: DuePreview, now: DateTime): Promise<void> {
    const text = decrypt(broadcast.text);
    if (!text) {
      this.logger.error(
        `предпросмотр ${broadcast._id.toString()}: текст не расшифровался`,
      );
      return;
    }
    const buttons = broadcast.lessonId
      ? [
          [
            inlineButton('Отменить', 'cancel', broadcast._id.toString()),
            inlineButton('Изменить тему', 'topic', broadcast.lessonId.toString()),
          ],
        ]
      : [[inlineButton('Отменить', 'cancel', broadcast._id.toString())]];

    const chats = await this.teacherChats.list(now);
    await Promise.all(
      chats.map((chat) => this.bot.sendMessage(chat.chatId, text, buttons)),
    );
  }
}
