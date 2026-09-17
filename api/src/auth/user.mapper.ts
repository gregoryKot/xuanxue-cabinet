// Единственный маппер UserLean → MeDto (CLAUDE.md «API»: явный toDto(),
// внутреннее представление наружу не идёт). email/telegramId/googleId сюда
// намеренно не входят — это ключи входа, не профиль для интерфейса
// (SECURITY §2). `status` — `active`/`blocked` (ADR-0026, ADR-0036), ждать
// больше нечего. `telegramLinked` — не сам id, а булев признак «есть ли
// telegramId»: по нему экран попытки решает, вести человека к боту или
// сразу к форме со ссылкой (ADR-0023, RUNBOOK §8.17). `botChatActive` —
// другой вопрос: «боту есть куда писать» (активный личный чат), а не просто
// известный telegramId. Разница видна у вошедших через виджет Telegram:
// telegramLinked уже true, а чата ещё нет, пока не нажато /start в боте
// (ADR-0042). Параметром, не вызовом сервиса — маппер остаётся чистой
// синхронной функцией, откуда взять значение решает вызывающая сторона.
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
  };
}
