// Кнопки под вопросом «Запись?» и под присланной записью (ADR-0172):
// «Записи не будет» (norec) и «К какому занятию?» (recpick). Отдельно от
// RecordingWaitHandler (файл-лимит 150 строк, CLAUDE.md «Храповики»), но
// сохранение и перевод ожидания — его же save()/moveWaitOn(): одна механика
// на сообщение и на кнопку.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import type { Context } from 'telegraf';
import { LessonRecord } from '../../lessons/lesson.schema';
import type { BotSessionLean } from '../bot-session.lean';
import { BotSessionService } from '../bot-session.service';
import type { RecordingSource } from './recording-source';
import { RecordingWaitHandler } from './recording-wait.handler';

// Кнопка выбора нажата, а источника на сессии уже нет: ожидание истекло или
// его вытеснил новый вопрос «Запись?» (recordingWaitUpdate сбрасывает источник).
const PICK_LOST_MESSAGE =
  'Не нашёл присланную запись — пришлите ссылку или видео ещё раз.';
const NO_RECORDING_MESSAGE = 'Хорошо, записи не будет.';

@Injectable()
export class RecordingButtonsHandler {
  constructor(
    private readonly botSessions: BotSessionService,
    private readonly recordingWait: RecordingWaitHandler,
    @InjectModel(LessonRecord.name) private readonly lessonModel: Model<LessonRecord>,
  ) {}

  /** «К какому занятию?» (recpick) — источник берётся с сессии. */
  async pick(
    ctx: Context,
    chatId: number,
    lessonId: string,
    now: DateTime,
  ): Promise<void> {
    const edit = (text: string) => ctx.editMessageText(text).catch(() => null);
    const session = await this.botSessions.get(chatId, now);
    const source = session?.kind === 'recording' ? sourceOf(session) : null;
    if (!source) {
      await edit(PICK_LOST_MESSAGE);
      return;
    }
    await this.recordingWait.save(ctx, chatId, lessonId, source, now, edit, true);
  }

  /** «Записи не будет» (norec): отметка на занятии — оно уходит из списка
   * «ещё жду» (recording-pending.ts); ожидание чата закрывается, только если
   * ждать больше нечего, иначе переводится на следующее занятие — учитель мог
   * получить три вопроса подряд и ответить «не будет» на первый. */
  async decline(
    ctx: Context,
    chatId: number,
    lessonId: string,
    now: DateTime,
  ): Promise<void> {
    await this.lessonModel.updateOne(
      { _id: lessonId },
      { $set: { recordingDeclinedAt: now.toJSDate() } },
    );
    // Чужое ожидание (тема, черновик) не трогаем; нет никакого — открываем
    // заново, если записи ждут ещё занятия.
    const session = await this.botSessions.get(chatId, now);
    const waiting = !session || session.kind === 'recording';
    await this.recordingWait.moveWaitOn(chatId, lessonId, now, waiting);
    await ctx.editMessageText(NO_RECORDING_MESSAGE).catch(() => null);
  }
}

function sourceOf(session: BotSessionLean): RecordingSource | null {
  if (session.recordingUrl) return { url: session.recordingUrl };
  if (session.recordingFileId) return { telegramFileId: session.recordingFileId };
  return null;
}
