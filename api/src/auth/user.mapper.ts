// Единственный маппер UserLean → MeDto (CLAUDE.md «API»: явный toDto(),
// внутреннее представление наружу не идёт). email/telegramId/googleId сюда
// намеренно не входят — это ключи входа, не профиль для интерфейса
// (SECURITY §2). `status` — `active`/`blocked` (ADR-0026, ADR-0036), ждать
// больше нечего. `telegramLinked` — не сам id, а булев признак «есть ли
// telegramId»: по нему экран попытки решает, вести человека к боту или
// сразу к форме со ссылкой (ADR-0023, RUNBOOK §8.17).
import type { MeDto } from '@xuanxue/shared';
import type { UserLean } from '../users/users.service';

export function toMeDto(user: UserLean): MeDto {
  return {
    id: user.id,
    name: user.name,
    roles: user.roles,
    tz: user.tz,
    status: user.status,
    telegramLinked: user.telegramId != null,
  };
}
