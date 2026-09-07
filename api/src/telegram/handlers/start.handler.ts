// /start — единственная точка входа для личного чата с ботом (docs/PLAN.md
// §6, ADR-0015). Учитель/админ (по telegramId в users) получает личный чат
// как канал: «бот, в который по времени приходит всё расписание» — то, что
// просил владелец. Чужой Telegram ID — вежливый отказ по VOICE, без канала.
// Только приватный чат: Telegram шлёт /start и в группах (например, при
// добавлении бота с командой в описании) — там это не про личный канал
// учителя, отвечать/создавать канал не нужно (обрабатывает my_chat_member).
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Context } from 'telegraf';
import { ChannelConfigService } from '../../channels/channel-config.service';
import { errorMessage, errorStack } from '../../common/error-info';
import { UsersService } from '../../users/users.service';

// leadMinutes задаётся на класс (docs/PLAN.md §6) — у личного чата учителя
// нет одного числа минут на все занятия, поэтому текст не называет его.
const TEACHER_MESSAGE =
  'Вы подключены: ссылки на занятия будут приходить сюда заранее — за столько ' +
  'минут, сколько указано у занятия. Добавьте бота в группу учеников — он начнёт ' +
  'слать туда же.';
const STRANGER_MESSAGE_BASE = 'Этот бот для учителя школы Сюань-Сюэ.';

function personalChatTitle(name: string): string {
  return `Личные сообщения: ${name}`;
}

@Injectable()
export class StartHandler {
  private readonly logger = new Logger(StartHandler.name);

  constructor(
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
    private readonly channelConfig: ChannelConfigService,
  ) {}

  async handle(ctx: Context): Promise<void> {
    if (ctx.chat?.type !== 'private') return;
    const from = ctx.from;
    if (!from) return;

    try {
      const user = await this.usersService.findByTelegramId(from.id);
      if (user && (user.roles.includes('teacher') || user.roles.includes('admin'))) {
        await this.channelConfig.upsertTelegramChat({
          chatId: String(from.id),
          title: personalChatTitle(user.name),
        });
        await ctx.reply(TEACHER_MESSAGE);
        return;
      }
      await ctx.reply(this.strangerMessage());
    } catch (err) {
      this.logger.error(`telegram.start: ${errorMessage(err)}`, errorStack(err));
    }
  }

  private strangerMessage(): string {
    const publicUrl = this.config.get<string>('PUBLIC_URL');
    if (!publicUrl) return STRANGER_MESSAGE_BASE;
    return `${STRANGER_MESSAGE_BASE} Расписание — на сайте ${publicUrl}`;
  }
}
