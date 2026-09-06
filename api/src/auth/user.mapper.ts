// Единственный маппер UserLean → MeDto (CLAUDE.md «API»: явный toDto(),
// внутреннее представление наружу не идёт). email/telegramId/googleId/status
// сюда намеренно не входят — это ключи входа и служебное состояние, не
// профиль для интерфейса (SECURITY §2).
import type { MeDto } from '@xuanxue/shared';
import type { UserLean } from '../users/users.service';

export function toMeDto(user: UserLean): MeDto {
  return { id: user.id, name: user.name, roles: user.roles, tz: user.tz };
}
