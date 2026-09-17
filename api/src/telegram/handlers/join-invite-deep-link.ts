// join_<code> — ссылка-приглашение школы через бота (ADR-0030 «Бот»,
// ADR-0036), вынесено из StartHandler целиком (файл-лимит 150 строк, тот же
// приём, что start-welcome.ts). Ветвление идёт по единому
// LoginIdentityService.resolveTelegramUser() (api/src/users/login-identity.service.ts)
// — том же сервисе, что и у POST /auth/telegram и email-входа: до этой
// правки хендлер дублировал findByTelegramId → isValid → createFromTelegram
// сам, и человек с BOOTSTRAP_ADMIN_TELEGRAM_ID, впервые открывший ссылку
// через бота, заводился обычным учеником без ролей вместо admin+teacher, как
// на сайте (аудит 2026-09-16) — один сервис, одно правило на веб и бот.
// ForbiddenError сервиса (незнакомец без валидного кода) переводим в свой
// текст — INVITE_LINK_INVALID_MESSAGE, тот же, что показывает InviteLinkService
// на уровне самой ссылки; `blocked` — обычный отказ бота.
//
// Баг с #131 (найден 2026-09-16 на аудите, #163): вход по ссылке делал
// человека active, но личный чат не регистрировался — PersonalChats.chatFor()
// отдавал null, и результат экзамена/уведомления бота не доходили до второго
// /start. После успеха зовём тот же welcomeConnectedUser, что и обычный
// /start для active (ADR-0027) — не копию: личный канал
// (broadcastEligible:false) ученику, канал школы штату, и меню. В обеих
// ветках успеха — и новому человеку, и уже active, открывшему ссылку снова.
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import type { User } from 'telegraf/types';
import { ACCESS_MESSAGE, INVITE_LINK_INVALID_MESSAGE } from '@xuanxue/shared';
import { fullName } from '../../auth/telegram-auth.service';
import type { ChannelConfigService } from '../../channels/channel-config.service';
import { ForbiddenError } from '../../common/errors';
import type { LoginIdentityService } from '../../users/login-identity.service';
import type { UserLean } from '../../users/users.service';
import { welcomeConnectedUser } from './start-welcome';

const JOIN_SUCCESS_PREFIX =
  'Вы в кабинете школы Сюань-Сюэ. Расписание и ссылки на занятия — здесь: ';

export interface JoinDeepLinkDeps {
  loginIdentity: LoginIdentityService;
  channelConfig: ChannelConfigService;
  publicUrl: string | undefined;
}

export async function handleInviteDeepLink(
  ctx: Context,
  from: Pick<User, 'id' | 'first_name' | 'last_name'>,
  code: string,
  now: DateTime,
  deps: JoinDeepLinkDeps,
): Promise<void> {
  let user: UserLean;
  try {
    user = await deps.loginIdentity.resolveTelegramUser(
      from.id,
      fullName(from),
      code,
      now,
    );
  } catch (err) {
    if (err instanceof ForbiddenError) {
      await ctx.reply(INVITE_LINK_INVALID_MESSAGE).catch(() => null);
      return;
    }
    throw err;
  }

  if (user.status === 'blocked') {
    await ctx.reply(ACCESS_MESSAGE).catch(() => null);
    return;
  }
  // Уже active (код игнорируется, как и в вебе) — идемпотентно тот же
  // успех, что у новичка: повторное открытие ссылки не ошибка.
  await ctx.reply(JOIN_SUCCESS_PREFIX + (deps.publicUrl ?? '')).catch(() => null);
  // Тот же шаг подключения, что и у обычного /start для active (ADR-0027):
  // личный канал (ученику — broadcastEligible:false, штату — канал школы) и меню.
  await welcomeConnectedUser(ctx, from.id, user, deps.channelConfig);
}
