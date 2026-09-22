// Свободный текст диалога «Собрать экзамен» (ТЗ 4б.4, docs/PLAN.md §12) —
// MessageHandler зовёт после сессии kind: 'examBuildDraft' (bot-session.
// service.ts), тем же приёмом, что NewExamItemMessageHandler для
// 'examItemDraft'. Два текстовых шага: название (обязательно текстом), лимит
// времени (кнопка ИЛИ число минут сообщением) — переход между ними НОВЫМ
// сообщением (ctx.reply), не editMessageText: у входящего текста нет
// message_id экрана бота.
import { Injectable, Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import { errorMessage, errorStack } from '../../common/error-info';
import type { BotSessionLean } from '../bot-session.lean';
import { BotSessionService } from '../bot-session.service';
import { ExamBotPortRegistry } from '../exam-bot-port.registry';
import { GENERIC_ERROR } from './callback-actions';
import { attemptsScreen, timeLimitScreen } from './new-exam-screens';
import { isActiveNewExamDraft } from './new-exam-types';

const NOT_TEXT_MESSAGE = 'Нажмите одну из кнопок или пришлите текст.';
const NOT_A_NUMBER_MESSAGE =
  'Пришлите число минут или нажмите одну из кнопок: без лимита, 15, 30, 60.';

@Injectable()
export class NewExamMessageHandler {
  private readonly logger = new Logger(NewExamMessageHandler.name);

  constructor(
    private readonly botSessions: BotSessionService,
    private readonly examBotPorts: ExamBotPortRegistry,
  ) {}

  async handle(
    ctx: Context,
    chatId: number,
    session: BotSessionLean,
    now: DateTime,
  ): Promise<void> {
    if (!isActiveNewExamDraft(session)) return; // защита в глубину

    const message = ctx.message;
    const text = message && 'text' in message ? message.text.trim() : undefined;
    if (!text) {
      await ctx.reply(NOT_TEXT_MESSAGE).catch(() => null);
      return;
    }

    try {
      // `await`, не `return` — тем же приёмом, что NewExamItemMessageHandler
      // (комментарий там же: отказ внутри `handle*` не должен уйти мимо
      // `catch` ниже).
      if (session.buildStep === 'title') {
        await this.handleTitle(ctx, chatId, text, now);
        return;
      }
      if (session.buildStep === 'timeLimit') {
        await this.handleTimeLimit(ctx, chatId, text, now);
        return;
      }
      await ctx.reply(NOT_TEXT_MESSAGE).catch(() => null); // 'pick'/'attempts'/'confirm' ждут кнопку
    } catch (err) {
      this.logger.error(`telegram.newExam: ${errorMessage(err)}`, errorStack(err));
      await ctx.reply(GENERIC_ERROR).catch(() => null);
    }
  }

  private async handleTitle(
    ctx: Context,
    chatId: number,
    text: string,
    now: DateTime,
  ): Promise<void> {
    const errors = await this.examBotPorts.get().validateExamDraft({ title: text });
    if (errors) {
      await ctx.reply(errors.join('\n')).catch(() => null);
      return;
    }
    await this.botSessions.setNewExamDraft(
      chatId,
      { step: 'timeLimit', title: text },
      now,
    );
    const screen = timeLimitScreen();
    await ctx
      .reply(screen.text, { reply_markup: { inline_keyboard: screen.buttons } })
      .catch(() => null);
  }

  private async handleTimeLimit(
    ctx: Context,
    chatId: number,
    text: string,
    now: DateTime,
  ): Promise<void> {
    const timeLimitMin = Number(text);
    if (!Number.isInteger(timeLimitMin) || timeLimitMin <= 0) {
      await ctx.reply(NOT_A_NUMBER_MESSAGE).catch(() => null);
      return;
    }
    const errors = await this.examBotPorts.get().validateExamDraft({ timeLimitMin });
    if (errors) {
      await ctx.reply(errors.join('\n')).catch(() => null);
      return;
    }
    await this.botSessions.setNewExamDraft(
      chatId,
      { step: 'attempts', timeLimitMin },
      now,
    );
    const screen = attemptsScreen();
    await ctx
      .reply(screen.text, { reply_markup: { inline_keyboard: screen.buttons } })
      .catch(() => null);
  }
}
