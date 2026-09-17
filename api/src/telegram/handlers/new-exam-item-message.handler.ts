// Свободный текст диалога «Новый вопрос» (ТЗ 4б.3, docs/PLAN.md §12) —
// MessageHandler зовёт после сессии kind: 'examItemDraft' (bot-session.
// service.ts), тем же приёмом, что ExamTextAnswerHandler для 'examText'.
// Три текстовых шага: формулировка, варианты (по одному сообщению), критерии
// (необязательный) — переход между ними НОВЫМ сообщением (ctx.reply), не
// editMessageText: у входящего текста нет message_id экрана бота.
import { Injectable, Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import { errorMessage, errorStack } from '../../common/error-info';
import type { BotSessionLean } from '../bot-session.service';
import { BotSessionService } from '../bot-session.service';
import { ExamBotPortRegistry } from '../exam-bot-port.registry';
import { GENERIC_ERROR } from './callback-actions';
import { confirmScreen, criteriaWaitScreen } from './new-exam-item-screens';
import { optionsWaitScreen } from './new-exam-item-options-screen';
import {
  hasOptionsStep,
  isActiveExamItemDraft,
  sessionToNewExamItemDraft,
} from './new-exam-item-types';

const NOT_TEXT_MESSAGE = 'Пришлите текст обычным сообщением.';

@Injectable()
export class NewExamItemMessageHandler {
  private readonly logger = new Logger(NewExamItemMessageHandler.name);

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
    if (!isActiveExamItemDraft(session)) return; // защита в глубину

    const message = ctx.message;
    const text = message && 'text' in message ? message.text.trim() : undefined;
    if (!text) {
      await ctx.reply(NOT_TEXT_MESSAGE).catch(() => null);
      return;
    }

    try {
      // `await`, не `return` — иначе отказ внутри `handle*` уходит мимо
      // `catch` ниже (async function резолвит внешний промис прямо из
      // `return`, не заходя в блок try повторно, — находка на этом PR).
      if (session.draftStep === 'prompt') {
        await this.handlePrompt(ctx, chatId, session, text, now);
        return;
      }
      if (session.draftStep === 'options') {
        await this.handleOption(ctx, chatId, session, text, now);
        return;
      }
      if (session.draftStep === 'criteria') {
        await this.handleCriteria(ctx, chatId, session, text, now);
        return;
      }
      await ctx.reply(NOT_TEXT_MESSAGE).catch(() => null); // 'correct'/'confirm' ждут кнопку, не текст
    } catch (err) {
      this.logger.error(`telegram.newExamItem: ${errorMessage(err)}`, errorStack(err));
      await ctx.reply(GENERIC_ERROR).catch(() => null);
    }
  }

  private async handlePrompt(
    ctx: Context,
    chatId: number,
    session: BotSessionLean & { draftKind: NonNullable<BotSessionLean['draftKind']> },
    text: string,
    now: DateTime,
  ): Promise<void> {
    const errors = await this.examBotPorts
      .get()
      .validateExamItemDraft({ kind: session.draftKind, prompt: text });
    if (errors) {
      await ctx.reply(errors.join('\n')).catch(() => null);
      return;
    }
    const nextStep = hasOptionsStep(session.draftKind) ? 'options' : 'criteria';
    await this.botSessions.setNewExamItemDraft(
      chatId,
      { step: nextStep, prompt: text },
      now,
    );
    const screen = nextStep === 'options' ? optionsWaitScreen([]) : criteriaWaitScreen();
    await ctx
      .reply(screen.text, { reply_markup: { inline_keyboard: screen.buttons } })
      .catch(() => null);
  }

  private async handleOption(
    ctx: Context,
    chatId: number,
    session: BotSessionLean & { draftKind: NonNullable<BotSessionLean['draftKind']> },
    text: string,
    now: DateTime,
  ): Promise<void> {
    const current = session.draftOptions ?? [];
    const next = [...current, { text, correct: false }];
    const errors = await this.examBotPorts.get().validateExamItemDraft({
      kind: session.draftKind,
      prompt: session.draftPrompt,
      options: next,
    });
    if (errors) {
      await ctx.reply(errors.join('\n')).catch(() => null);
      return;
    }
    await this.botSessions.setNewExamItemDraft(
      chatId,
      { step: 'options', options: next },
      now,
    );
    const screen = optionsWaitScreen(next);
    await ctx
      .reply(screen.text, { reply_markup: { inline_keyboard: screen.buttons } })
      .catch(() => null);
  }

  private async handleCriteria(
    ctx: Context,
    chatId: number,
    session: BotSessionLean & { draftKind: NonNullable<BotSessionLean['draftKind']> },
    text: string,
    now: DateTime,
  ): Promise<void> {
    const errors = await this.examBotPorts.get().validateExamItemDraft({
      kind: session.draftKind,
      prompt: session.draftPrompt,
      options: session.draftOptions,
      criteria: text,
    });
    if (errors) {
      await ctx.reply(errors.join('\n')).catch(() => null);
      return;
    }
    await this.botSessions.setNewExamItemDraft(
      chatId,
      { step: 'confirm', criteria: text },
      now,
    );
    const screen = confirmScreen({
      ...sessionToNewExamItemDraft(session),
      criteria: text,
    });
    await ctx
      .reply(screen.text, { reply_markup: { inline_keyboard: screen.buttons } })
      .catch(() => null);
  }
}
