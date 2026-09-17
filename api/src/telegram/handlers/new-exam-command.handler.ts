// /экзамен (и кнопка «Собрать экзамен» меню, menu-screens.ts) — шаг 'pick'
// диалога «Собрать экзамен» (ТЗ 4б.4, docs/PLAN.md §12, ADR-0024). Только
// личный чат учителя/помощника/админа с активным каналом — тот же гейт, что
// у /вопрос (private-teacher-chat.ts). В отличие от screen 1 «Нового
// вопроса» (безсессионный до выбора типа), здесь сессия заводится сразу:
// отметки нужно копить с первого сообщения, второй инстанс при деплое
// должен их видеть.
import { Injectable, Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import { errorMessage, errorStack } from '../../common/error-info';
import type { BotSessionService } from '../bot-session.service';
import type { ExamBotPortRegistry } from '../exam-bot-port.registry';
import { PersonalChats } from '../personal-chats';
import type { BotMenu } from './bot-menu';
import { pickScreen } from './new-exam-pick-screen';
import { resolvePrivatePersonalChatId } from './private-teacher-chat';

@Injectable()
export class NewExamCommandHandler {
  private readonly logger = new Logger(NewExamCommandHandler.name);

  constructor(
    private readonly personalChats: PersonalChats,
    private readonly examBotPorts: ExamBotPortRegistry,
    private readonly botSessions: BotSessionService,
  ) {}

  async handle(ctx: Context, now: DateTime): Promise<void> {
    try {
      const chatId = await resolvePrivatePersonalChatId(ctx, this.personalChats, now);
      if (chatId === null) return;
      const screen = await this.pickScreen(chatId, now);
      await ctx
        .reply(screen.text, { reply_markup: { inline_keyboard: screen.buttons } })
        .catch(() => null);
    } catch (err) {
      this.logger.error(`telegram./экзамен: ${errorMessage(err)}`, errorStack(err));
    }
  }

  /** Общий экран для команды и для кнопки меню (menu-screens.ts) — доступ
   * там уже проверен (isPersonalChat в CallbackQueryHandler.handle до
   * dispatch), второй проверки не нужно, как у 'newitem'. Список пуст — не
   * заводим сессию вовсе: нечего отмечать, «Отмена» без активного диалога
   * выглядела бы странно. */
  async pickScreen(chatId: number, now: DateTime): Promise<BotMenu> {
    const items = await this.examBotPorts.get().listExamItemsToAssemble();
    if (items.length === 0) return pickScreen([], [], 0);
    await this.botSessions.startNewExamDraft(chatId, now);
    return pickScreen(items, [], 0);
  }
}
