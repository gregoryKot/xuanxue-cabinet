// /вопрос (и кнопка «Новый вопрос» меню, menu-screens.ts) — screen 1 диалога
// «Новый вопрос» (ТЗ 4б.3, docs/PLAN.md §12, ADR-0024). Только личный чат
// учителя/помощника/админа с активным каналом — тот же гейт, что у /тема
// (private-teacher-chat.ts): заводить вопрос ученику незачем, отказ тот же,
// что у прочих команд штата (тихое игнорирование).
import { Injectable, Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import { errorMessage, errorStack } from '../../common/error-info';
import { PersonalChats } from '../personal-chats';
import { kindSelectScreen } from './new-exam-item-screens';
import { resolvePrivatePersonalChatId } from './private-teacher-chat';

@Injectable()
export class NewExamItemCommandHandler {
  private readonly logger = new Logger(NewExamItemCommandHandler.name);

  constructor(private readonly personalChats: PersonalChats) {}

  async handle(ctx: Context, now: DateTime): Promise<void> {
    try {
      const chatId = await resolvePrivatePersonalChatId(ctx, this.personalChats, now);
      if (chatId === null) return;
      const screen = kindSelectScreen();
      await ctx
        .reply(screen.text, { reply_markup: { inline_keyboard: screen.buttons } })
        .catch(() => null);
    } catch (err) {
      this.logger.error(`telegram./вопрос: ${errorMessage(err)}`, errorStack(err));
    }
  }
}
