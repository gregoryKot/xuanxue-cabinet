// «Жду запись» после «Занятие закончилось» (docs/PLAN.md §6, ADR-0175) —
// вынесено из message.handler.ts (файл-лимит 150 строк, CLAUDE.md
// «Храповики»): диспетчер по виду ожидания остаётся там, сама механика
// сохранения записи — здесь, тем же приёмом, что topic (saveOrExplain).
// Куда класть запись, решается так: ответ (reply) на вопрос бота — в то
// занятие; иначе, если записи ждёт одно занятие, — в него; ждут несколько —
// бот спрашивает кнопками «К какому занятию?» (recpick), источник до выбора
// лежит на сессии. Сами кнопки (norec/recpick) — recording-buttons.handler.ts,
// он зовёт save()/moveWaitOn() отсюда: одна механика сохранения на оба входа.
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import type { Context } from 'telegraf';
import type { LessonDto } from '@xuanxue/shared';
import { BroadcastRecord } from '../../broadcasts/broadcast.schema';
import { ClassRecord } from '../../classes/class.schema';
import { LessonRecord } from '../../lessons/lesson.schema';
import { LessonsService } from '../../lessons/lessons.service';
import type { BotSessionLean } from '../bot-session.lean';
import { BotSessionService } from '../bot-session.service';
import { inlineButton } from '../callback-data';
import { saveOrExplain, type SaveOrExplainTexts } from './message-save';
import { buildRecordingConfirmation } from './recording-confirmation';
import { listPendingRecordings, pendingTail } from './recording-pending';
import { lessonIdFromRepliedPrompt } from './recording-reply';
import { extractRecordingSource, type RecordingSource } from './recording-source';

const TEXTS: SaveOrExplainTexts = {
  notFound: 'Занятие не найдено — возможно, его отменили. Запись сохранять некуда.',
  failed: 'Не получилось сохранить запись. Пришлите ещё раз.',
};
const PICK_LESSON_MESSAGE = 'К какому занятию эта запись?';

@Injectable()
export class RecordingWaitHandler {
  private readonly logger = new Logger(RecordingWaitHandler.name);
  private readonly onError = (message: string, stack?: string): void =>
    this.logger.error(`telegram.recording: ${message}`, stack);

  constructor(
    private readonly botSessions: BotSessionService,
    private readonly lessonsService: LessonsService,
    @InjectModel(BroadcastRecord.name)
    private readonly broadcastModel: Model<BroadcastRecord>,
    @InjectModel(ClassRecord.name) private readonly classModel: Model<ClassRecord>,
    @InjectModel(LessonRecord.name) private readonly lessonModel: Model<LessonRecord>,
  ) {}

  /** `true` — сообщение было про запись и обработано; `false` — это не
   * источник записи или записи сейчас не ждут, диспетчер идёт дальше. */
  async handle(
    ctx: Context,
    session: BotSessionLean | null,
    chatId: number,
    now: DateTime,
  ): Promise<boolean> {
    const source = extractRecordingSource(ctx.message);
    if (!source) return false;
    const reply = (text: string) => ctx.reply(text).catch(() => null);

    const replied = lessonIdFromRepliedPrompt(ctx.message);
    const current = session?.kind === 'recording' ? (session.lessonId ?? null) : null;
    if (replied) {
      await this.save(ctx, chatId, replied, source, now, reply, current !== null);
      return true;
    }
    if (!current) return false;

    const pending = await listPendingRecordings(this.lessonModel, this.classModel, now);
    if (pending.length > 1) {
      await this.botSessions.setRecordingSource(chatId, source);
      const buttons = pending.map((p) => [inlineButton(p.label, 'recpick', p.id)]);
      await ctx
        .reply(PICK_LESSON_MESSAGE, { reply_markup: { inline_keyboard: buttons } })
        .catch(() => null);
      return true;
    }
    const target = pending[0]?.id ?? current.toString();
    await this.save(ctx, chatId, target, source, now, reply, true);
    return true;
  }

  async save(
    ctx: Context,
    chatId: number,
    lessonId: string,
    source: RecordingSource,
    now: DateTime,
    respond: (text: string) => Promise<unknown>,
    waiting: boolean,
  ): Promise<void> {
    let saved: LessonDto | undefined;
    const ok = await saveOrExplain(
      ctx,
      this.botSessions,
      chatId,
      async () => {
        saved = await this.lessonsService.addRecording(lessonId, source, now);
      },
      TEXTS,
      this.onError,
    );
    if (!ok || !saved) return;

    const pending = await this.moveWaitOn(chatId, lessonId, now, waiting);
    const confirmation = await buildRecordingConfirmation(
      this.classModel,
      this.broadcastModel,
      saved,
    );
    await respond(confirmation + pendingTail(pending));
  }

  /** Записи ждут ещё занятия — ожидание чата переводится на первое из них
   * (и сброшенный источник, recordingWaitUpdate); нет — закрывается, но
   * только своё: ответ на старый вопрос бота поверх чужого ожидания (тема,
   * черновик вопроса) его не гасит. */
  async moveWaitOn(chatId: number, lessonId: string, now: DateTime, waiting: boolean) {
    const pending = await listPendingRecordings(this.lessonModel, this.classModel, now);
    const next = pending[0];
    if (next && waiting) await this.botSessions.startRecordingWait(chatId, next.id, now);
    else if (waiting) await this.botSessions.clearIfLesson(chatId, lessonId);
    return pending;
  }
}
