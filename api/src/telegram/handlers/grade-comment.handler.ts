// Свободный текст комментария после кнопки «Зачёт»/«Доработать»/«Незачёт»
// (ТЗ 4б.5, PLAN §12) — MessageHandler зовёт после сессии kind:
// 'gradeComment' (bot-session.service.ts). Сохраняет тем же
// ExamBotPort.gradeAttempt, что и «Без комментария» (grade-comment-save.ts,
// grade-callback.handler.ts) — CLAUDE.md «Одна механика — один компонент».
import { Injectable, Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import { GRADING_LIMITS } from '@xuanxue/shared';
import { errorMessage, errorStack } from '../../common/error-info';
import { UsersService } from '../../users/users.service';
import type { BotSessionLean } from '../bot-session.lean';
import { BotSessionService } from '../bot-session.service';
import { ExamBotPortRegistry } from '../exam-bot-port.registry';
import { GENERIC_ERROR } from './callback-actions';
import { saveGradingAndReply } from './grade-comment-save';
import { GRADE_NOT_TEXT_MESSAGE } from './grade-messages';

@Injectable()
export class GradeCommentHandler {
  private readonly logger = new Logger(GradeCommentHandler.name);

  constructor(
    private readonly botSessions: BotSessionService,
    private readonly usersService: UsersService,
    private readonly examBotPorts: ExamBotPortRegistry,
  ) {}

  async handle(
    ctx: Context,
    chatId: number,
    session: BotSessionLean,
    now: DateTime,
  ): Promise<void> {
    if (!session.attemptId || !session.outcome) return; // защита в глубину

    const message = ctx.message;
    const text = message && 'text' in message ? message.text.trim() : undefined;
    if (!text) {
      await ctx.reply(GRADE_NOT_TEXT_MESSAGE).catch(() => null);
      return;
    }

    try {
      const grader = await this.usersService.findByTelegramId(chatId);
      if (!grader) return; // сессия открыта только штату — защита в глубину

      const comment = text.slice(0, GRADING_LIMITS.comment);
      await saveGradingAndReply(
        this.examBotPorts.get(),
        this.botSessions,
        chatId,
        session.attemptId.toString(),
        session.outcome,
        comment,
        grader,
        now,
        (t) => ctx.reply(t),
      );
    } catch (err) {
      this.logger.error(`telegram.gradeComment: ${errorMessage(err)}`, errorStack(err));
      await ctx.reply(GENERIC_ERROR).catch(() => null);
    }
  }
}
