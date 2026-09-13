// /start — единственная точка входа для личного чата с ботом (docs/PLAN.md
// §6, ADR-0015). Учитель/админ (по telegramId в users) получает личный чат
// как канал: «бот, в который по времени приходит всё расписание» — то, что
// просил владелец. Чужой Telegram ID — вежливый отказ по VOICE, без канала:
// адрес сайта школы (settings.schoolSiteUrl) в отказе, если учитель его
// заполнил на экране «Шаблоны» — не PUBLIC_URL, тот адрес самого кабинета,
// а незнакомцу в кабинет смотреть нечего (В6 аудита, ADR-0009-доп.).
// Только приватный чат: Telegram шлёт /start и в группах (например, при
// добавлении бота с командой в описании) — там это не про личный канал
// учителя, отвечать/создавать канал не нужно (обрабатывает my_chat_member).
import { Injectable, Logger } from '@nestjs/common';
import type { Context } from 'telegraf';
import { ChannelConfigService } from '../../channels/channel-config.service';
import { errorMessage, errorStack } from '../../common/error-info';
import { SettingsService } from '../../settings/settings.service';
import { UsersService } from '../../users/users.service';
import { BOT_STAFF_ROLES, buildBotMenu, buildStrangerMessage } from './bot-menu';

// leadMinutes задаётся на класс (docs/PLAN.md §6) — у личного чата учителя
// нет одного числа минут на все занятия, поэтому текст не называет его.
// Дальше идёт само меню кнопками (bot-menu.ts): раньше /start отвечал этой
// строкой и заканчивался, и всё остальное, что бот умеет, оставалось
// невидимым (отзыв владельца 2026-09-12).
const TEACHER_MESSAGE =
  'Вы подключены: ссылки на занятия будут приходить сюда заранее — за столько ' +
  'минут, сколько указано у занятия. Добавьте бота в группу учеников — он начнёт ' +
  'слать туда же.';

function personalChatTitle(name: string): string {
  return `Личные сообщения: ${name}`;
}

@Injectable()
export class StartHandler {
  private readonly logger = new Logger(StartHandler.name);

  constructor(
    private readonly settingsService: SettingsService,
    private readonly usersService: UsersService,
    private readonly channelConfig: ChannelConfigService,
  ) {}

  async handle(ctx: Context): Promise<void> {
    if (ctx.chat?.type !== 'private') return;
    const from = ctx.from;
    if (!from) return;

    try {
      const user = await this.usersService.findByTelegramId(from.id);
      if (user && user.roles.some((role) => BOT_STAFF_ROLES.includes(role))) {
        await this.channelConfig.upsertTelegramChat({
          chatId: String(from.id),
          title: personalChatTitle(user.name),
        });
        const menu = buildBotMenu();
        await ctx.reply(TEACHER_MESSAGE);
        await ctx
          .reply(menu.text, { reply_markup: { inline_keyboard: menu.buttons } })
          .catch(() => null);
        return;
      }
      await ctx.reply(await this.strangerMessage());
    } catch (err) {
      this.logger.error(`telegram.start: ${errorMessage(err)}`, errorStack(err));
    }
  }

  private async strangerMessage(): Promise<string> {
    const { schoolSiteUrl } = await this.settingsService.get();
    return buildStrangerMessage(schoolSiteUrl);
  }
}
