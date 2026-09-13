// «Жду запись» после «Занятие закончилось» (docs/PLAN.md §6) — вынесено из
// message.handler.ts (файл-лимит 150 строк, CLAUDE.md «Храповики»):
// диспетчер по виду ожидания остаётся там, сама механика сохранения записи —
// здесь, тем же приёмом, что topic (saveOrExplain).
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import type { Model, Types } from 'mongoose';
import type { Context } from 'telegraf';
import type { LessonDto } from '@xuanxue/shared';
import { BroadcastRecord } from '../../broadcasts/broadcast.schema';
import { ClassRecord } from '../../classes/class.schema';
import { LessonsService } from '../../lessons/lessons.service';
import { BotSessionService } from '../bot-session.service';
import { saveOrExplain, type SaveOrExplainTexts } from './message-save';
import { buildRecordingConfirmation } from './recording-confirmation';
import { extractRecordingSource } from './recording-source';

const TEXTS: SaveOrExplainTexts = {
  notFound: 'Занятие не найдено — возможно, его отменили. Запись сохранять некуда.',
  failed: 'Не получилось сохранить запись. Пришлите ещё раз.',
};

@Injectable()
export class RecordingWaitHandler {
  constructor(
    private readonly botSessions: BotSessionService,
    private readonly lessonsService: LessonsService,
    @InjectModel(BroadcastRecord.name)
    private readonly broadcastModel: Model<BroadcastRecord>,
    @InjectModel(ClassRecord.name) private readonly classModel: Model<ClassRecord>,
  ) {}

  async handle(
    ctx: Context,
    lessonId: Types.ObjectId,
    chatId: number,
    now: DateTime,
    onError: (message: string, stack?: string) => void,
  ): Promise<void> {
    const source = extractRecordingSource(ctx.message);
    if (!source) return; // не источник — ждём дальше, сессия не закрывается

    let saved: LessonDto | undefined;
    const ok = await saveOrExplain(
      ctx,
      this.botSessions,
      chatId,
      async () => {
        saved = await this.lessonsService.addRecording(lessonId.toString(), source, now);
      },
      TEXTS,
      onError,
    );
    if (!ok || !saved) return;

    await this.botSessions.clear(chatId);
    const reply = await buildRecordingConfirmation(
      this.classModel,
      this.broadcastModel,
      saved,
    );
    await ctx.reply(reply).catch(() => null);
  }
}
