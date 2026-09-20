// link_<code> — связка Telegram с аккаунтом, заведённым по почте или Google
// (ADR-0034): вынесено из StartHandler целиком (файл-лимит 150 строк, тот же
// приём, что у join-invite-deep-link.ts). Код одноразовый, выпускает его
// кабинет по кнопке «Связать Telegram» ДЛЯ УЖЕ АУТЕНТИФИЦИРОВАННОЙ сессии
// (TelegramLinkCodeService) — личность подтверждает сам факт владения кодом,
// не отдельная проверка здесь.
//
// BotUserAccessService.resolve() здесь НЕ вызывается и вызываться не должен:
// это точка проверки «кто этот telegramId и в каком статусе он уже известен
// боту», а у отправителя ссылки telegramId на аккаунте ещё не стоит —
// `resolve()` по определению отдал бы `unknown` (SECURITY §2, «первый вход
// через Telegram», тот же случай: связки без записи ещё не существует).
// Личность и результат отдаёт TelegramLinkService.linkByCode() одним вызовом
// по самому коду.
//
// Ответ на успех называет аккаунт по имени (не «готово» без подробностей) —
// это и есть защита от подсунутого чужого кода: если код попал к человеку не
// по адресу, он видит чужое имя и может сообщить администратору школы,
// вместо того чтобы молча получить доступ к чужим данным. Имя называется
// только на успехе: отказы отвечают общим текстом, чтобы код к чужому
// аккаунту ничего о нём не рассказывал (SECURITY §2).
//
// Баг с #131 (тот же класс ошибки, что и у join_<code>, починен там в #163,
// см. комментарий в start.handler.ts и join-invite-deep-link.ts): успешная
// связка ставила telegramId на аккаунт, но запись в channels не появлялась —
// PersonalChats.chatFor/hasActiveChatFor (personal-chats.ts) без неё человека
// не находят, и результат экзамена или уведомление о сдаче не доходят никуда.
// После ответа зовём тот же welcomeConnectedUser, что и join_<code> и обычный
// /start для active (ADR-0027) — на каждый `linked`, без проверки статуса:
// заблокированный до этой ветки не доходит, `linkByCode` отдаёт ему отдельный
// исход `blocked` и ничего не пишет (SECURITY §2, §9). `linked` бывает только
// у активного, и повторная проверка здесь означала бы одно решение в двух
// местах.
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import {
  ACCESS_MESSAGE,
  TELEGRAM_LINK_CODE_INVALID_MESSAGE,
  TELEGRAM_LINK_OTHER_TELEGRAM_MESSAGE,
  TELEGRAM_LINK_TAKEN_MESSAGE,
} from '@xuanxue/shared';
import type { ChannelConfigService } from '../../channels/channel-config.service';
import type { TelegramLinkService } from '../../users/telegram-link.service';
import { welcomeConnectedUser } from './start-welcome';

function linkedMessage(name: string): string {
  return (
    `Готово. Этот Telegram связан с аккаунтом «${name}» в кабинете школы — ` +
    'присылайте видео экзамена прямо сюда.\n\n' +
    'Связывали не вы? Напишите администратору школы.'
  );
}

export interface TelegramLinkDeepLinkDeps {
  linkService: TelegramLinkService;
  channelConfig: ChannelConfigService;
}

export async function handleTelegramLinkDeepLink(
  ctx: Context,
  code: string,
  telegramId: number,
  now: DateTime,
  deps: TelegramLinkDeepLinkDeps,
): Promise<void> {
  const result = await deps.linkService.linkByCode(code, telegramId, now);

  switch (result.kind) {
    case 'invalid':
      await ctx.reply(TELEGRAM_LINK_CODE_INVALID_MESSAGE).catch(() => null);
      return;
    case 'blocked':
      await ctx.reply(ACCESS_MESSAGE).catch(() => null);
      return;
    case 'taken':
      await ctx.reply(TELEGRAM_LINK_TAKEN_MESSAGE).catch(() => null);
      return;
    case 'other-telegram':
      await ctx.reply(TELEGRAM_LINK_OTHER_TELEGRAM_MESSAGE).catch(() => null);
      return;
    case 'linked':
      await ctx.reply(linkedMessage(result.user.name)).catch(() => null);
      await welcomeConnectedUser(ctx, telegramId, result.user, deps.channelConfig);
      return;
  }
}
