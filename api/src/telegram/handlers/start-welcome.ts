// Подключение личного чата и приветствие по /start для ПОДТВЕРЖДЁННОГО
// (active) человека — вынесено из StartHandler (файл-лимит 150 строк,
// CLAUDE.md «Храповики»). Штат — тем же путём, что и раньше: канал школы
// (ADR-0015, получает всё расписание) и общее меню. Ученик (active без
// ролей штата, ADR-0026) — личный канал, который НЕ становится получателем
// рассылок (ChannelConfigService.upsertPersonalTelegramChat, ADR-0027) и
// своё узкое меню (buildStudentMenu) — блокер аудита 2026-09-15: раньше
// /start отвечал ученику отказом «бот для учителя», его канал не заводился
// нигде, и PersonalChats.chatFor для него всегда отдавал null — результат
// экзамена не мог дойти ни при каких условиях.
import { isStaffRole } from '@xuanxue/shared';
import type { Context } from 'telegraf';
import type { ChannelConfigService } from '../../channels/channel-config.service';
import type { UserLean } from '../../users/users.service';
import { resetChatBotCommands, setStaffBotCommands } from '../bot-commands';
import { buildBotMenu, buildStudentMenu } from './bot-menu';

// leadMinutes задаётся на класс (docs/PLAN.md §6) — у личного чата учителя
// нет одного числа минут на все занятия, поэтому текст не называет его.
const TEACHER_MESSAGE =
  'Вы подключены: ссылки на занятия будут приходить сюда заранее — за столько ' +
  'минут, сколько указано у занятия. Добавьте бота в группу учеников — он начнёт ' +
  'слать туда же.';

function personalChatTitle(name: string): string {
  return `Личные сообщения: ${name}`;
}

export async function welcomeConnectedUser(
  ctx: Context,
  telegramId: number,
  user: UserLean,
  channelConfig: ChannelConfigService,
): Promise<void> {
  const chatId = String(telegramId);
  const title = personalChatTitle(user.name);

  // Список команд у Telegram клиентский (bot-commands.ts) — выставляем его
  // на чат в момент, когда узнали, кто это; при старте сервиса то же самое
  // для уже подключённых делает syncBotCommands. Обе функции best-effort:
  // не обновившееся меню — не повод отвечать отказом на /start.
  if (isStaffRole(user.roles)) {
    await channelConfig.upsertTelegramChat({ chatId, title });
    await setStaffBotCommands(ctx.telegram, chatId);
    const menu = buildBotMenu();
    // Раньше /start заканчивался этой строкой, и всё, что бот ещё умеет,
    // оставалось невидимым (отзыв владельца 2026-09-12) — следом идёт меню.
    await ctx.reply(TEACHER_MESSAGE);
    await ctx
      .reply(menu.text, { reply_markup: { inline_keyboard: menu.buttons } })
      .catch(() => null);
    return;
  }

  await channelConfig.upsertPersonalTelegramChat({ chatId, title });
  await resetChatBotCommands(ctx.telegram, chatId);
  const menu = buildStudentMenu();
  await ctx
    .reply(menu.text, { reply_markup: { inline_keyboard: menu.buttons } })
    .catch(() => null);
}
