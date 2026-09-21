// Четвёртый шаг тика (docs/PLAN.md §6 «Telegram-бот для учителя»): за
// settings.previewMinutes до отправки бот шлёт учителю текст поста с
// кнопками «Отменить»/«Изменить тему» — broadcast к этому моменту уже создан
// (BroadcastPlannerService, окно расширено на то же число минут в
// decideBroadcast). Значение читаем из SettingsService.get() — настройка
// школы, не константа (CLAUDE.md «Кабинет учителя: всё настраивается в
// интерфейсе»). `previewSentAt` ставится условным апдейтом ДО отправки:
// дубли при двух инстансах исключены; ожидаемая неудача (текст не
// расшифровался) — лог, повтор не нужен, сама рассылка всё равно уйдёт по
// расписанию (delivery-runner). Неожиданное исключение — другое дело:
// claimAndRun (аудит 2026-09-21, HIGH) снимает claim, следующий тик
// попробует предпросмотр снова.
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import type { Model, Types } from 'mongoose';
import { claimAndRun } from '../common/claim-once';
import { errorMessage, errorStack } from '../common/error-info';
import { decrypt } from '../utils/encryption';
import { SettingsService } from '../settings/settings.service';
import { inlineButton } from '../telegram/callback-data';
import { PersonalChats } from '../telegram/personal-chats';
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
    private readonly personalChats: PersonalChats,
    private readonly bot: TelegramBotService,
    private readonly settingsService: SettingsService,
  ) {}

  async sendPending(now: DateTime): Promise<PreviewResult> {
    const { previewMinutes } = await this.settingsService.get();
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
            $lte: now.plus({ minutes: previewMinutes }).toJSDate(),
          },
        },
        { lessonId: 1, text: 1 },
      )
      .lean<DuePreview[]>();
    if (due.length === 0) return { claimed: 0 };

    // Один список чатов на весь тик — за то время, что тик перебирает
    // рассылки, состав подключённых учителей не меняется, а PersonalChats
    // сама решает, когда логировать пустой список (не чаще раза в час).
    // post_draft — вид уведомления «Черновик поста» (ТЗ
    // notifications-delivery.md §2): кто выключил его себе, тому предпросмотр
    // не приходит, остальным — как раньше.
    const chats = await this.personalChats.listFor('post_draft', now);

    let claimed = 0;
    for (const broadcast of due) {
      // claimAndRun (аудит 2026-09-21, HIGH): раньше claim стоял без
      // try/catch — упади sendToTeachers, отметка осталась бы стоять
      // навсегда, а с ней и предпросмотр для этой рассылки. Теперь падение
      // снимает claim, следующий тик подхватит рассылку заново.
      const done = await claimAndRun(
        this.broadcastModel,
        broadcast._id,
        'previewSentAt',
        now,
        async () => {
          await this.sendToTeachers(broadcast, chats);
          return true;
        },
        (error) =>
          this.logger.error(
            `предпросмотр ${broadcast._id.toString()} упал после claim: ${errorMessage(error)}`,
            errorStack(error),
          ),
      );
      if (done) claimed += 1;
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
