// /exams, /экзамены и кнопка «Экзамены» в главном меню бота (ТЗ 4б.2,
// ADR-0024, PLAN.md §12): список опубликованных форм и положение ученика по
// каждой — то же, что видно в кабинете (MyExamsService.list через
// ExamBotPort, не второй запрос). Открыт любому известному человеку по
// telegramId, не только штату: экзамен сдают ученики, поэтому доступ здесь
// не через PersonalChats (та пускает только учителя/помощника/админа с
// активным личным каналом), а напрямую по UsersService.findByTelegramId —
// тот же приём, что у ExamMediaMessageHandler (ADR-0023).
//
// Обычный провайдер Nest: register-handlers.ts получает его тем же списком
// BotHandlers, что и остальные хендлеры, а экран меню — параметром
// (menu-screens.ts). Файловые храповики от этого выросли на три строки —
// это осознанно зафиксировано в бейслайне, а не обойдено глобальной
// переменной.
import { Injectable, Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import { errorMessage, errorStack } from '../../common/error-info';
import { UsersService } from '../../users/users.service';
import { ExamBotPortRegistry } from '../exam-bot-port.registry';
import type { BotMenu } from './bot-menu';
import { buildExamListScreen } from './exam-list-screen';

@Injectable()
export class ExamCommandHandler {
  private readonly logger = new Logger(ExamCommandHandler.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly examBotPorts: ExamBotPortRegistry,
  ) {}

  async handle(ctx: Context, now: DateTime): Promise<void> {
    try {
      if (ctx.chat?.type !== 'private') return;
      const menu = await this.listScreen(ctx.chat.id, now);
      if (!menu) return;
      await ctx
        .reply(menu.text, { reply_markup: { inline_keyboard: menu.buttons } })
        .catch(() => null);
    } catch (err) {
      this.logger.error(`telegram./exams: ${errorMessage(err)}`, errorStack(err));
    }
  }

  /** Общий экран для команды и для кнопки меню (menu-screens.ts) — один
   * рендер на два входа, как у /schedule и /уведомления. `null` — незнакомец
   * (нет записи в users по этому telegramId). */
  async listScreen(chatId: number, now: DateTime): Promise<BotMenu | null> {
    const user = await this.usersService.findByTelegramId(chatId);
    if (!user) return null;
    const exams = await this.examBotPorts.get().listMyExams(user, now);
    return buildExamListScreen(exams);
  }
}
