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
import { claimOnce } from '../common/claim-once';
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
  /** Рассылок, для которых этот вызов «забрал» отправку предпросмотра
   * (условный апдейт previewSentAt сработал) — не число реально доставленных
   * учителям сообщений: учителей может быть несколько или ни одного. */
  claimed: number;
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
          // Нижняя граница отсекает scheduledAt в прошлом: догоняющий тик
          // или легаси-документ с уже наступившим временем отправки — раннер
          // доставок заберёт его сам в этот же тик, предпросмотр для
          // события, которое вот-вот (или уже) ушло, только путает учителя.
          scheduledAt: {
            $gte: now.toJSDate(),
            $lte: now.plus({ minutes: PREVIEW_MINUTES }).toJSDate(),
          },
        },
        { lessonId: 1, text: 1 },
      )
      .lean<DuePreview[]>();
    if (due.length === 0) return { claimed: 0 };

    // Один список чатов на весь тик — за то время, что тик перебирает
    // рассылки, состав подключённых учителей не меняется, а TeacherChats
    // сама решает, когда логировать пустой список (не чаще раза в час).
    const chats = await this.teacherChats.list(now);

    let claimed = 0;
    for (const broadcast of due) {
      if (await claimOnce(this.broadcastModel, broadcast._id, 'previewSentAt', now)) {
        await this.sendToTeachers(broadcast, chats);
        claimed += 1;
      }
    }
    return { claimed };
  }

  /** `TelegramBotService.sendMessage` сама глотает сбой сети (warn в лог) —
   * здесь только «нечем послать» (текст не расшифровался). */
  private async sendToTeachers(
    broadcast: DuePreview,
    chats: readonly { chatId: string }[],
  ): Promise<void> {
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

    await Promise.all(
      chats.map((chat) => this.bot.sendMessage(chat.chatId, text, buttons)),
    );
  }
}
