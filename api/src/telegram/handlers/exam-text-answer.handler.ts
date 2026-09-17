// Свободный текст ответа на вопрос экзамена (ТЗ 4б.2 часть 2, ADR-0024) —
// MessageHandler зовёт после сессии kind: 'examText' (bot-session.service.ts),
// тот же приём, что ExamMediaMessageHandler для 'examMedia': диспетчер по
// виду ожидания — в message.handler.ts, сама механика — здесь. Сохраняет тем
// же ExamBotPort.saveAnswer, что и вариант ответа (exam-attempt-answer.ts).
// Следующий экран — НОВЫМ сообщением (presentAttemptScreen, via: 'reply'),
// не editMessageText: пришло не нажатие кнопки, у входящего текстового
// сообщения нет message_id экрана бота, который редактировать.
//
// Личность — через BotUserAccessService.resolve(), не напрямую
// UsersService: blocked получает отказ и сессия закрывается — иначе
// заблокированный продолжал бы отвечать на вопросы открытой попытки
// (SECURITY §9).
import { Injectable, Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import { ATTEMPT_LIMITS, ATTEMPT_NOT_FOUND_MESSAGE } from '@xuanxue/shared';
import { errorMessage, errorStack } from '../../common/error-info';
import type { UserLean } from '../../users/users.service';
import { BotUserAccessService } from '../bot-user-access.service';
import type { BotSessionLean } from '../bot-session.service';
import { BotSessionService } from '../bot-session.service';
import { ExamBotPortRegistry } from '../exam-bot-port.registry';
import { examUserFacingError } from './exam-attempt-error';
import { flattenAttemptQuestions } from './exam-question-screen';
import { presentAttemptScreen, renderAttemptScreen } from './exam-question-render';

const NOT_TEXT_MESSAGE = 'Ждём ответ текстом — пришлите его обычным сообщением.';

@Injectable()
export class ExamTextAnswerHandler {
  private readonly logger = new Logger(ExamTextAnswerHandler.name);

  constructor(
    private readonly botSessions: BotSessionService,
    private readonly botAccess: BotUserAccessService,
    private readonly examBotPorts: ExamBotPortRegistry,
  ) {}

  async handle(
    ctx: Context,
    telegramId: number,
    session: BotSessionLean,
    now: DateTime,
  ): Promise<void> {
    if (!session.attemptId || session.questionIndex == null) return; // защита в глубину

    const message = ctx.message;
    const text = message && 'text' in message ? message.text.trim() : undefined;
    if (!text) {
      await ctx.reply(NOT_TEXT_MESSAGE).catch(() => null);
      return;
    }

    try {
      const access = await this.botAccess.resolve(telegramId);
      if (access.kind === 'unknown') return; // сессия открыта незнакомцу быть не может — защита в глубину
      if (access.kind === 'denied') {
        await this.botSessions.clear(telegramId);
        await ctx.reply(access.message).catch(() => null);
        return;
      }
      await this.saveAndAdvance(
        ctx,
        telegramId,
        access.user,
        session.attemptId.toString(),
        session.questionIndex,
        text,
        now,
      );
    } catch (err) {
      this.logger.error(`telegram.examText: ${errorMessage(err)}`, errorStack(err));
      await ctx.reply(examUserFacingError(err)).catch(() => null);
    }
  }

  private async saveAndAdvance(
    ctx: Context,
    telegramId: number,
    user: UserLean,
    attemptId: string,
    questionIndex: number,
    text: string,
    now: DateTime,
  ): Promise<void> {
    const examBot = this.examBotPorts.get();
    const attempt = await examBot.loadOwnAttempt(attemptId, user, now);
    if (!attempt) {
      await this.botSessions.clear(telegramId);
      await ctx.reply(ATTEMPT_NOT_FOUND_MESSAGE).catch(() => null);
      return;
    }

    const question = flattenAttemptQuestions(attempt)[questionIndex];
    if (!question || attempt.status !== 'in_progress') {
      const view = await renderAttemptScreen(
        this.botSessions,
        telegramId,
        attempt,
        questionIndex,
        now,
      );
      await presentAttemptScreen(
        ctx,
        { examBot, user, chatId: telegramId, attemptId },
        view,
        { via: 'reply', withAlbum: true },
      );
      return;
    }

    const answerText = text.slice(0, ATTEMPT_LIMITS.answerText);
    const updated = await examBot.saveAnswer(
      attemptId,
      user,
      { itemId: question.itemId, text: answerText },
      now,
    );
    // Свободный текст — одно атомарное действие, как выбор в single
    // (exam-attempt-answer.ts): отправил сообщение — вопрос закрыт, экран
    // сам переходит к следующему, на последнем остаётся на месте («Сдать»
    // уже виден).
    const total = flattenAttemptQuestions(updated).length;
    const nextIndex = Math.min(questionIndex + 1, total - 1);
    const view = await renderAttemptScreen(
      this.botSessions,
      telegramId,
      updated,
      nextIndex,
      now,
    );
    await presentAttemptScreen(
      ctx,
      { examBot, user, chatId: telegramId, attemptId },
      view,
      { via: 'reply', withAlbum: true },
    );
  }
}
