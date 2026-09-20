// Единственный маппер UserLean → MeDto (CLAUDE.md «API»: явный toDto(),
// внутреннее представление наружу не идёт). telegramId/googleId — непрозрачные
// id ключей входа, наружу не идут вовсе (telegramLinked отдаёт только булев
// признак «есть ли»). Email — исключение (ADR-0059, ср. комментарий в
// shared/src/me.ts): `GET /auth/me` отвечает только про владельца сессии
// (@CurrentUser()), и свой адрес уходит тому, у кого он и так в почтовом
// ящике — раскрывать здесь некому. Чужие адреса по-прежнему закрыты: UserDto
// на «Людях» email не отдаёт ни одной роли (SECURITY §1). `status` —
// `active`/`blocked` (ADR-0026, ADR-0036), ждать больше нечего.
// `telegramLinked` — не сам id, а булев признак «есть ли telegramId»: по
// нему экран попытки решает, вести человека к боту или сразу к форме со
// ссылкой (ADR-0023, RUNBOOK §8.17). `botChatActive` — другой вопрос: «боту
// есть куда писать» (активный личный чат), а не просто известный telegramId.
// Разница видна у вошедших через виджет Telegram: telegramLinked уже true, а
// чата ещё нет, пока не нажато /start в боте (ADR-0042). Параметром, не
// вызовом сервиса — маппер остаётся чистой синхронной функцией, откуда
// взять значение решает вызывающая сторона. `needsProfile` — человек ещё не
// назвал себя сам (ADR-0044): пусто `profileNamedAt` значит либо заглушку
// NEW_PERSON_NAME после входа по почте, либо имя из Telegram, которое
// человек не подтверждал — в обоих случаях кабинет один раз спрашивает имя
// экраном `/welcome`.
import type { MeDto } from '@xuanxue/shared';
import type { UserLean } from '../users/users.service';

export function toMeDto(user: UserLean, botChatActive: boolean): MeDto {
  return {
    id: user.id,
    name: user.name,
    roles: user.roles,
    tz: user.tz,
    status: user.status,
    telegramLinked: user.telegramId != null,
    botChatActive,
    hasEmail: user.email != null,
    pendingEmail: user.pendingEmail,
    needsProfile: user.profileNamedAt == null,
  };
}
