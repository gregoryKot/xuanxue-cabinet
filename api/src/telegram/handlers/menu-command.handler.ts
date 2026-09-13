// /start, /menu, /help и /schedule в личном чате: до этого бот отвечал одной
// стеной текста и ничего больше не показывал (отзыв владельца 2026-09-12).
// Доступ — тот же, что у /тема и /уведомления: личный чат подключённого
// учителя, помощника или админа (private-teacher-chat.ts). Незнакомцу и
// ученику отвечает StartHandler своим текстом — сюда они не доходят.
import { Injectable, Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import { errorMessage, errorStack } from '../../common/error-info';
import { MyLessonsService } from '../../lessons/my-lessons.service';
import { PersonalChats } from '../personal-chats';
import { buildBotMenu, buildHelpText, type BotMenu } from './bot-menu';
import { formatScheduleScreen, SCHEDULE_LESSONS_LIMIT } from './bot-schedule';
import { resolvePrivatePersonalChatId } from './private-teacher-chat';

@Injectable()
export class MenuCommandHandler {
  private readonly logger = new Logger(MenuCommandHandler.name);

  constructor(
    private readonly personalChats: PersonalChats,
    private readonly myLessonsService: MyLessonsService,
  ) {}

  async showMenu(ctx: Context, now: DateTime): Promise<void> {
    await this.reply(ctx, now, '/menu', () => Promise.resolve(buildBotMenu()));
  }

  async showSchedule(ctx: Context, now: DateTime): Promise<void> {
    await this.reply(ctx, now, '/schedule', () => this.scheduleScreen(now));
  }

  async showHelp(ctx: Context, now: DateTime): Promise<void> {
    await this.reply(ctx, now, '/help', () =>
      Promise.resolve({ text: buildHelpText('staff'), buttons: buildBotMenu().buttons }),
    );
  }

  /** Экран «Ближайшие занятия» — общий для команды и для кнопки меню
   * (callback-actions.ts): один подбор, один формат. */
  async scheduleScreen(now: DateTime): Promise<BotMenu> {
    const lessons = await this.myLessonsService.list(
      { limit: SCHEDULE_LESSONS_LIMIT },
      now,
    );
    return formatScheduleScreen(lessons);
  }

  private async reply(
    ctx: Context,
    now: DateTime,
    command: string,
    build: () => Promise<BotMenu>,
  ): Promise<void> {
    try {
      const chatId = await resolvePrivatePersonalChatId(ctx, this.personalChats, now);
      if (chatId === null) return;
      const menu = await build();
      await ctx
        .reply(menu.text, { reply_markup: { inline_keyboard: menu.buttons } })
        .catch(() => null);
    } catch (err) {
      this.logger.error(`telegram.${command}: ${errorMessage(err)}`, errorStack(err));
    }
  }
}
