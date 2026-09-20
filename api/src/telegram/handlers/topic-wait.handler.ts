// «Жду тему» после кнопки «Изменить тему»/команды /тема (docs/PLAN.md §6) —
// вынесено из message.handler.ts (файл-лимит CLAUDE.md «Храповики»), тем же
// приёмом, что RecordingWaitHandler для записи: диспетчер по виду ожидания
// остаётся там, сама механика сохранения темы — здесь.
import { Injectable } from '@nestjs/common';
import type { DateTime } from 'luxon';
import type { Types } from 'mongoose';
import type { Context } from 'telegraf';
import { LESSON_LIMITS } from '@xuanxue/shared';
import { LessonLinkRebuildService } from '../../broadcasts/lesson-link-rebuild.service';
import { LessonsService } from '../../lessons/lessons.service';
import { BotSessionService } from '../bot-session.service';
import { saveOrExplain, type SaveOrExplainTexts } from './message-save';

const TEXTS: SaveOrExplainTexts = {
  notFound: 'Занятие не найдено — возможно, его отменили. Откройте предпросмотр заново.',
  failed: 'Не получилось сохранить тему. Попробуйте ещё раз.',
};

@Injectable()
export class TopicWaitHandler {
  constructor(
    private readonly botSessions: BotSessionService,
    private readonly lessonsService: LessonsService,
    private readonly lessonLinkRebuild: LessonLinkRebuildService,
  ) {}

  async handle(
    ctx: Context,
    lessonId: Types.ObjectId,
    chatId: number,
    now: DateTime,
    onError: (message: string, stack?: string) => void,
  ): Promise<void> {
    const message = ctx.message;
    const text = message && 'text' in message ? message.text.trim() : undefined;
    if (!text || text.startsWith('/')) return; // не текст темы — ждём дальше, сессия не закрывается

    const topic = text.slice(0, LESSON_LIMITS.topic);
    const saved = await saveOrExplain(
      ctx,
      this.botSessions,
      chatId,
      async () => {
        await this.lessonsService.update(lessonId.toString(), { topic }, now);
      },
      TEXTS,
      onError,
    );
    if (!saved) return;

    await this.botSessions.clear(chatId);
    const rebuilt = await this.lessonLinkRebuild.rebuild(lessonId, now);
    const suffix = rebuilt ? '' : '. Пост уже ушёл в каналы со старой темой.';
    await ctx.reply(`Тема сохранена: ${topic}${suffix}`).catch(() => null);
  }
}
