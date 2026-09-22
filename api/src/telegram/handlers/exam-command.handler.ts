// /exams, /экзамены и кнопка «Экзамены» в главном меню бота (ТЗ 4б.2,
// ADR-0024, PLAN.md §12): список опубликованных форм и положение ученика по
// каждой — то же, что видно в кабинете (MyExamsService.list через
// ExamBotPort, не второй запрос). Открыт любому известному человеку по
// telegramId, не только штату: экзамен сдают ученики, поэтому доступ здесь
// не через PersonalChats (та пускает только учителя/помощника/админа с
// активным личным каналом), а через BotUserAccessService — единственную
// точку «кто это и в каком он статусе» (тот же приём, что у
// ExamMediaMessageHandler, ADR-0023; правило — как у AuthGuard в вебе,
// SECURITY §9: `blocked` не сдаёт экзамены и здесь).
//
// /exams — в общем списке команд Telegram (all_private_chats, ADR-0090): его
// видит и незнакомец, у которого нет записи в users, ещё до того, как
// нажмёт. Молчание на этом пункте меню отзыв владельца 2026-09-21 читал как
// «бот сломан», поэтому незнакомец получает тот же вежливый отказ, что и у
// /start (replyStranger, stranger-reply.ts), а не тишину.
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
import { SettingsService } from '../../settings/settings.service';
import { BotUserAccessService } from '../bot-user-access.service';
import { ExamBotPortRegistry } from '../exam-bot-port.registry';
import { backToMenuButton, type BotMenu } from './bot-menu';
import { buildExamListScreen } from './exam-list-screen';
import { replyStranger } from './stranger-reply';

@Injectable()
export class ExamCommandHandler {
  private readonly logger = new Logger(ExamCommandHandler.name);

  constructor(
    private readonly botAccess: BotUserAccessService,
    private readonly examBotPorts: ExamBotPortRegistry,
    private readonly settingsService: SettingsService,
  ) {}

  async handle(ctx: Context, now: DateTime): Promise<void> {
    try {
      if (ctx.chat?.type !== 'private') return;
      const menu = await this.listScreen(ctx.chat.id, now);
      if (!menu) {
        await replyStranger(ctx, this.settingsService);
        return;
      }
      await ctx
        .reply(menu.text, { reply_markup: { inline_keyboard: menu.buttons } })
        .catch(() => null);
    } catch (err) {
      this.logger.error(`telegram./exams: ${errorMessage(err)}`, errorStack(err));
    }
  }

  /** Общий экран для команды и для кнопки меню (menu-screens.ts) — один
   * рендер на три входа, как у /schedule и /уведомления. `null` — незнакомец
   * (нет записи в users по этому telegramId): контракт для кнопки меню
   * (open-menu-screen.ts) не меняется, там `null` по-прежнему значит «не
   * трогать сообщение», а `handle()` этой же командой отвечает вежливым
   * отказом (см. комментарий вверху файла). `blocked` — экран с отказом
   * вместо списка: тихо игнорировать нельзя (CLAUDE.md «тихий отказ — самая
   * дорогая ошибка»), а кнопка «В меню» не даёт застрять на отказе. */
  async listScreen(chatId: number, now: DateTime): Promise<BotMenu | null> {
    const access = await this.botAccess.resolve(chatId);
    if (access.kind === 'unknown') return null;
    if (access.kind === 'denied') {
      return { text: access.message, buttons: [backToMenuButton()] };
    }
    const exams = await this.examBotPorts.get().listMyExams(access.user, now);
    return buildExamListScreen(exams, now.toMillis());
  }
}
