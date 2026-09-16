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
// вместо того чтобы молча получить доступ к чужим данным.
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import {
  TELEGRAM_LINK_CODE_INVALID_MESSAGE,
  TELEGRAM_LINK_OTHER_TELEGRAM_MESSAGE,
  TELEGRAM_LINK_TAKEN_MESSAGE,
} from '@xuanxue/shared';
import type { TelegramLinkService } from '../../users/telegram-link.service';

function linkedMessage(name: string): string {
  return (
    `Готово. Этот Telegram связан с аккаунтом «${name}» в кабинете школы — ` +
    'присылайте видео экзамена прямо сюда.\n\n' +
    'Связывали не вы? Напишите администратору школы.'
  );
}

export async function handleTelegramLinkDeepLink(
  ctx: Context,
  code: string,
  telegramId: number,
  now: DateTime,
  linkService: TelegramLinkService,
): Promise<void> {
  const result = await linkService.linkByCode(code, telegramId, now);

  switch (result.kind) {
    case 'invalid':
      await ctx.reply(TELEGRAM_LINK_CODE_INVALID_MESSAGE).catch(() => null);
      return;
    case 'taken':
      await ctx.reply(TELEGRAM_LINK_TAKEN_MESSAGE).catch(() => null);
      return;
    case 'other-telegram':
      await ctx.reply(TELEGRAM_LINK_OTHER_TELEGRAM_MESSAGE).catch(() => null);
      return;
    case 'linked':
      await ctx.reply(linkedMessage(result.user.name)).catch(() => null);
      return;
  }
}
