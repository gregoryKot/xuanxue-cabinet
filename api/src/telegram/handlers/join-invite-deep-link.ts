// join_<code> — ссылка-приглашение школы через бота (ADR-0030 «Бот»,
// ADR-0034), вынесено из StartHandler целиком (файл-лимит 150 строк, тот же
// приём, что start-welcome.ts). Смысл ссылки — новый ученик открывает её из
// канала и сразу в школе (владелец, уточнение 2026-09-15): ВАЛИДНЫЙ код
// заводит незнакомца из Telegram-идентичности апдейта тем же способом, что
// и первый вход через виджет на сайте (TelegramAuthService.fullName +
// UsersService.createFromTelegram), сразу `active` — статуса «ждёт
// подтверждения» больше нет (ADR-0034). НЕВАЛИДНЫЙ код и нет записи в users
// — пользователя НЕ заводим (мусорные /start не должны плодить аккаунты,
// SECURITY §2): код проверяем ДО создания. Известный человек — код
// игнорируется (та же логика, что и в LoginIdentityService для веба): уже
// `active` получает тот же текст успеха, `blocked` — обычный отказ бота.
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import type { User } from 'telegraf/types';
import { ACCESS_MESSAGE, INVITE_LINK_INVALID_MESSAGE } from '@xuanxue/shared';
import { fullName } from '../../auth/telegram-auth.service';
import type { InviteLinkService } from '../../users/invite-link.service';
import type { UsersService } from '../../users/users.service';

const JOIN_SUCCESS_PREFIX =
  'Вы в кабинете школы Сюань-Сюэ. Расписание и ссылки на занятия — здесь: ';

export interface JoinDeepLinkDeps {
  usersService: UsersService;
  inviteLinkService: InviteLinkService;
  publicUrl: string | undefined;
}

export async function handleInviteDeepLink(
  ctx: Context,
  from: Pick<User, 'id' | 'first_name' | 'last_name'>,
  code: string,
  now: DateTime,
  deps: JoinDeepLinkDeps,
): Promise<void> {
  const existing = await deps.usersService.findByTelegramId(from.id);
  if (existing) {
    if (existing.status === 'blocked') {
      await ctx.reply(ACCESS_MESSAGE).catch(() => null);
      return;
    }
    // Уже active (код игнорируется, как и в вебе) — идемпотентно тот же
    // успех, что у новичка: повторное открытие ссылки не ошибка.
    await ctx.reply(JOIN_SUCCESS_PREFIX + (deps.publicUrl ?? '')).catch(() => null);
    return;
  }

  const isValid = await deps.inviteLinkService.isValid(code);
  if (!isValid) {
    await ctx.reply(INVITE_LINK_INVALID_MESSAGE).catch(() => null);
    return;
  }

  const user = await deps.usersService.createFromTelegram({
    telegramId: from.id,
    name: fullName(from),
    roles: [],
    status: 'active',
  });
  await deps.usersService.markJoinedViaInvite(user.id, now);
  await ctx.reply(JOIN_SUCCESS_PREFIX + (deps.publicUrl ?? '')).catch(() => null);
}
