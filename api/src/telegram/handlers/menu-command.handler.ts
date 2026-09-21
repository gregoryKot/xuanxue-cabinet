// /menu, /schedule и /help в личном чате — три аудитории, не одна (баг от
// владельца 2026-09-21: «зашёл в бот с ученика — ничего не работает, даже
// хелп»). Раньше все три команды пропускали только личный чат подключённого
// штата (private-teacher-chat.ts) и всем остальным, включая ученика и
// незнакомца, хендлер молча выходил — PLAN.md «Меню бота» требует для
// незнакомца вежливый отказ, а для ученика есть своё узкое меню
// (buildStudentMenu). Порядок разбора аудитории — resolveAudience(): штат
// (тот же гейт, что у /тема), иначе BotUserAccessService — тот же, что у
// /уведомления (ADR-0065) и у /start.
import { Injectable, Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import { errorMessage, errorStack } from '../../common/error-info';
import { MyLessonsService } from '../../lessons/my-lessons.service';
import { SettingsService } from '../../settings/settings.service';
import { BotUserAccessService } from '../bot-user-access.service';
import { PersonalChats } from '../personal-chats';
import {
  buildBotMenu,
  buildHelpText,
  buildStrangerMessage,
  buildStudentMenu,
  type BotMenu,
  type BotMenuAudience,
} from './bot-menu';
import { formatScheduleScreen, SCHEDULE_LESSONS_LIMIT } from './bot-schedule';
import { resolvePrivatePersonalChatId } from './private-teacher-chat';

/** Разбор resolveAudience(): либо аудитория известна, либо готов текст
 * отказа (unknown/denied) — reply() ниже решает, что с этим делать. */
type AudienceResolution =
  { readonly audience: BotMenuAudience } | { readonly denied: string };

@Injectable()
export class MenuCommandHandler {
  private readonly logger = new Logger(MenuCommandHandler.name);

  constructor(
    private readonly personalChats: PersonalChats,
    private readonly myLessonsService: MyLessonsService,
    private readonly botAccess: BotUserAccessService,
    private readonly settingsService: SettingsService,
  ) {}

  async showMenu(ctx: Context, now: DateTime): Promise<void> {
    await this.reply(ctx, now, '/menu', (audience) =>
      Promise.resolve(this.menuFor(audience)),
    );
  }

  async showSchedule(ctx: Context, now: DateTime): Promise<void> {
    await this.reply(ctx, now, '/schedule', (audience) =>
      // Расписание школы со ссылками Zoom — экран штата (buildStudentMenu
      // своего списка занятий не показывает, ADR-0027): ученику вместо
      // него — его меню, оно и объясняет, что боту сказать. Молчать на
      // команду нельзя в любом случае.
      audience === 'staff'
        ? this.scheduleScreen(now)
        : Promise.resolve(this.menuFor(audience)),
    );
  }

  async showHelp(ctx: Context, now: DateTime): Promise<void> {
    await this.reply(ctx, now, '/help', (audience) =>
      Promise.resolve({
        text: buildHelpText(audience),
        buttons: this.menuFor(audience).buttons,
      }),
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

  private menuFor(audience: BotMenuAudience): BotMenu {
    return audience === 'staff' ? buildBotMenu() : buildStudentMenu();
  }

  /** Один разбор аудитории на все три команды (CLAUDE.md «Одна механика —
   * один компонент»): не личный чат — молчим, как и раньше (в группе меню
   * не место). */
  private async resolveAudience(
    ctx: Context,
    now: DateTime,
  ): Promise<AudienceResolution | null> {
    if (ctx.chat?.type !== 'private') return null;

    // Тот же гейт, что у /тема (private-teacher-chat.ts) — SECURITY
    // §«callback_data бота» требует для штата не роль саму по себе, а ещё и
    // активный личный канал.
    const staffChatId = await resolvePrivatePersonalChatId(ctx, this.personalChats, now);
    if (staffChatId !== null) return { audience: 'staff' };

    // Учитель, который ещё не нажал /start (нет активного личного канала),
    // попадает сюда же, в ветку ученика — /start это чинит первым же
    // нажатием, а штатные кнопки без подключённого канала всё равно не
    // работают.
    const access = await this.botAccess.resolve(ctx.chat.id);
    if (access.kind === 'unknown') {
      const { schoolSiteUrl } = await this.settingsService.get();
      return { denied: buildStrangerMessage(schoolSiteUrl) };
    }
    if (access.kind === 'denied') return { denied: access.message };
    return { audience: 'student' };
  }

  private async reply(
    ctx: Context,
    now: DateTime,
    command: string,
    build: (audience: BotMenuAudience) => Promise<BotMenu>,
  ): Promise<void> {
    try {
      const resolved = await this.resolveAudience(ctx, now);
      if (resolved === null) return;
      if ('denied' in resolved) {
        // Без reply_markup, а не с пустым inline_keyboard — тихий отказ
        // запрещён (CLAUDE.md), но и кнопок отказу не положено.
        await ctx.reply(resolved.denied).catch(() => null);
        return;
      }
      const menu = await build(resolved.audience);
      await ctx
        .reply(menu.text, { reply_markup: { inline_keyboard: menu.buttons } })
        .catch(() => null);
    } catch (err) {
      this.logger.error(`telegram.${command}: ${errorMessage(err)}`, errorStack(err));
    }
  }
}
