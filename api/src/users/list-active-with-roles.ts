// Активные люди с любой из переданных ролей — кандидаты в получатели записи
// кабинета (InAppExamNotifier, api/src/notifications/in-app-exam-notifier.ts).
// В отличие от list-contacts-with-roles.ts (PersonalChats — требует
// telegramId), кабинету не нужен канал связи: записать можно любому
// активному человеку с нужной ролью. status: 'active' — та же оговорка, что
// у TeachersService.listTeachers и LoginIdentityService (SECURITY §9,
// ADR-0026/0036): заблокированный человек не должен получать новые
// уведомления ни в одном канале. Вынесено отдельным файлом тем же приёмом,
// что list-contacts-with-roles.ts: UsersService не растёт за лимит файла
// (CLAUDE.md «Храповики»).
import type { Model, Types } from 'mongoose';
import { LIST_LIMIT_MAX, type UserRole } from '@xuanxue/shared';
import type { UserRecord } from './user.schema';

export interface ActiveRoledUser {
  id: string;
  roles: UserRole[];
}

export async function listActiveWithRoles(
  model: Model<UserRecord>,
  roles: readonly UserRole[],
): Promise<ActiveRoledUser[]> {
  // Пустой список ролей — пустой результат без похода в базу (тот же приём,
  // что у listContactsWithRoles): вид уведомления, которого нет ни у одной
  // роли, не должен слать лишний запрос.
  if (roles.length === 0) return [];

  const docs = await model
    .find({ roles: { $in: roles }, status: 'active' }, { roles: 1 })
    // Список внутренний, но без лимита — «дай всё» тем же запрещённым
    // приёмом, что и у публичных списков (CLAUDE.md «API»).
    .limit(LIST_LIMIT_MAX)
    .lean<{ _id: Types.ObjectId; roles: UserRole[] }[]>();
  return docs.map((doc) => ({ id: doc._id.toString(), roles: doc.roles }));
}
