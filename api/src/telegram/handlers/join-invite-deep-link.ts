// join_<code> — ссылка-приглашение школы через бота (ADR-0030 «Бот»),
// вынесено из StartHandler целиком (файл-лимит 150 строк, тот же приём, что
// start-welcome.ts). Смысл ссылки — новый ученик открывает её из канала и
// сразу в школе (владелец, уточнение 2026-09-15): ВАЛИДНЫЙ код заводит
// незнакомца из Telegram-идентичности апдейта тем же способом, что и первый
// вход через виджет на сайте (TelegramAuthService.fullName +
// UsersService.createFromTelegram, invited без ролей — переиспользуем, не
// дублируем), и сразу проводит его через JoinByInviteService.join(), тот же
// переход invited → active, что и веб (POST /auth/join, JoinController).
// НЕВАЛИДНЫЙ код и нет записи в users — пользователя НЕ заводим (мусорные
// /start не должны плодить аккаунты, SECURITY §2): код проверяем ДО
// создания тем же InviteLinkService.isValid(), что и JoinByInviteService.join()
// внутри — дважды, но без внешней проверки решение «создавать или нет»
// принять нечем. blocked/неверный код у уже известного человека — те же
// тексты, что у остальных отказов бота (ACCESS_MESSAGE, INVITE_LINK_INVALID_MESSAGE).
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import type { User } from 'telegraf/types';
import { ACCESS_MESSAGE, INVITE_LINK_INVALID_MESSAGE } from '@xuanxue/shared';
import { fullName } from '../../auth/telegram-auth.service';
import { ForbiddenError, UnauthorizedError } from '../../common/errors';
import type { InviteLinkService } from '../../users/invite-link.service';
import type { JoinByInviteService } from '../../users/join-by-invite.service';
import type { UsersService } from '../../users/users.service';

const JOIN_SUCCESS_PREFIX =
  'Вы в кабинете школы Сюань-Сюэ. Расписание и ссылки на занятия — здесь: ';

export interface JoinDeepLinkDeps {
  usersService: UsersService;
  joinByInviteService: JoinByInviteService;
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
  let user = await deps.usersService.findByTelegramId(from.id);
  if (!user) {
    const isValid = await deps.inviteLinkService.isValid(code);
    if (!isValid) {
      await ctx.reply(INVITE_LINK_INVALID_MESSAGE).catch(() => null);
      return;
    }
    user = await deps.usersService.createFromTelegram({
      telegramId: from.id,
      name: fullName(from),
      roles: [],
      status: 'invited',
    });
  }

  try {
    await deps.joinByInviteService.join(user, code, now);
    await ctx.reply(JOIN_SUCCESS_PREFIX + (deps.publicUrl ?? '')).catch(() => null);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      await ctx.reply(INVITE_LINK_INVALID_MESSAGE).catch(() => null);
      return;
    }
    if (err instanceof ForbiddenError) {
      await ctx.reply(ACCESS_MESSAGE).catch(() => null);
      return;
    }
    throw err;
  }
}
