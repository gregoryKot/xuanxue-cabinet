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
//
// Второй payload формата `exam_<attemptId>` (ADR-0023, PLAN §11 слой 4.5) —
// deep link «Отправить видео» из кабинета, открыт ЛЮБОМУ пользователю
// Telegram, не только штату школы: заводит ожидание видео в
// BotSessionService и выходит раньше проверки роли. Владение попыткой здесь
// не проверяется — ответ на /start одинаков для чужого и несуществующего
// attemptId (не подтверждаем существование, SECURITY §3); саму привязку
// проверяет MediaAssetsService, когда видео придёт (exam-media-message.handler.ts).
import { Injectable, Logger } from '@nestjs/common';
import { isStaffRole } from '@xuanxue/shared';
import type { DateTime } from 'luxon';
import { Types } from 'mongoose';
import type { Context } from 'telegraf';
import { ChannelConfigService } from '../../channels/channel-config.service';
import { errorMessage, errorStack } from '../../common/error-info';
import { SettingsService } from '../../settings/settings.service';
import { UsersService } from '../../users/users.service';
import { BotSessionService } from '../bot-session.service';
import { buildBotMenu, buildStrangerMessage } from './bot-menu';

const EXAM_MEDIA_PAYLOAD_PATTERN = /^exam_([0-9a-fA-F]{24})$/;

/** Текст после `/start ` — Telegraf типизирует `ctx.startPayload` только
 * внутри своего `bot.start()` (composer.d.ts, `StartContextExtn`), а не на
 * общем `Context`, поэтому читаем сырой текст сообщения тем же приёмом, что
 * и остальные хендлеры (recording-source.ts) — без кастов и без потери типа. */
function startPayload(ctx: Context): string | undefined {
  const message = ctx.message;
  if (!message || !('text' in message)) return undefined;
  const [, payload] = message.text.split(' ');
  return payload;
}

/** `null` — не deep link на видео экзамена (обычный /start, чужая команда). */
function examAttemptIdFromPayload(payload: string | undefined): string | null {
  const attemptId = payload?.match(EXAM_MEDIA_PAYLOAD_PATTERN)?.[1];
  return attemptId && Types.ObjectId.isValid(attemptId) ? attemptId : null;
}

const EXAM_MEDIA_WAIT_MESSAGE =
  'Снимите или пришлите видео прямо сюда — обычным сообщением, «кружком» ' +
  'или файлом. Как только дойдёт, учитель сможет его посмотреть.';

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
    private readonly botSessions: BotSessionService,
  ) {}

  async handle(ctx: Context, now: DateTime): Promise<void> {
    if (ctx.chat?.type !== 'private') return;
    const from = ctx.from;
    if (!from) return;

    try {
      const examAttemptId = examAttemptIdFromPayload(startPayload(ctx));
      if (examAttemptId) {
        await this.botSessions.startExamMediaWait(from.id, examAttemptId, now);
        await ctx.reply(EXAM_MEDIA_WAIT_MESSAGE).catch(() => null);
        return;
      }

      const user = await this.usersService.findByTelegramId(from.id);
      if (user && isStaffRole(user.roles)) {
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
