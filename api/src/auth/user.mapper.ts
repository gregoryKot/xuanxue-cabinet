// Единственный маппер UserLean → MeDto (CLAUDE.md «API»: явный toDto(),
// внутреннее представление наружу не идёт). email/telegramId/googleId сюда
// намеренно не входят — это ключи входа, не профиль для интерфейса
// (SECURITY §2). `status` входит с ADR-0026: по нему кабинет показывает
// экран ожидания вместо пустого расписания.
import type { MeDto } from '@xuanxue/shared';
import type { UserLean } from '../users/users.service';

export function toMeDto(user: UserLean): MeDto {
  return {
    id: user.id,
    name: user.name,
    roles: user.roles,
    tz: user.tz,
    status: user.status,
  };
}
