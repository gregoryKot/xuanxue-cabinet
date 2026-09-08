// Тело PATCH /users/:id — экран «Люди» назначает роли целиком (не добавляет
// и не снимает по одной, см. shared/src/users.ts). `@ArrayMaxSize` —
// USER_ROLES.length, ролей в системе всего три (CLAUDE.md «Валидация входа»:
// массивы — с ограничением размера).
import { ArrayMaxSize, ArrayUnique, IsArray, IsIn } from 'class-validator';
import { USER_ROLES, type UpdateUserRolesInput, type UserRole } from '@xuanxue/shared';

export class UpdateUserRolesDto implements UpdateUserRolesInput {
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(USER_ROLES.length)
  @IsIn(USER_ROLES, { each: true })
  roles!: UserRole[];
}
