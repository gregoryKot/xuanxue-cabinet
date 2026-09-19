// Пользователи с подключённым Telegram, у которых есть любая из переданных
// ролей — общий пул кандидатов для PersonalChats
// (api/src/telegram/personal-chats.ts): `list()` зовёт с фиксированной
// тройкой штата (identity-проверки хендлеров, SECURITY §3), `listFor(kind)` —
// с ролями, которым положен конкретный вид уведомления
// (`rolesWithNotification`, shared/src/notifications.ts). Роли — параметр
// именно поэтому: раньше тройка была зашита внутри и бухгалтер, которому
// адресован вид `payments`, не мог попасть в `listFor('payments')` никаким
// образом (тихий отказ, CLAUDE.md «Логи и наблюдаемость»). Вынесено из
// users.service.ts отдельным файлом тем же приёмом, что upsert-user-by-key.ts:
// сервис не растёт за 150 строк (file-size-ratchet, ревью владельца 2026-09-15).
import type { Model, Types } from 'mongoose';
import { LIST_LIMIT_DEFAULT, type UserRole } from '@xuanxue/shared';
import type { UserRecord } from './user.schema';

export interface RoledContact {
  id: string;
  name: string;
  telegramId: number;
  roles: UserRole[];
}

export async function listContactsWithRoles(
  model: Model<UserRecord>,
  roles: readonly UserRole[],
): Promise<RoledContact[]> {
  // Пустой список ролей — пустой результат без похода в базу: `$in: []`
  // и так вернул бы пусто, но лишний запрос на каждый тик планировщика
  // (вид уведомления, которого нет ни у одной роли) не нужен.
  if (roles.length === 0) return [];

  const docs = await model
    .find(
      { telegramId: { $exists: true }, roles: { $in: roles } },
      { name: 1, telegramId: 1, roles: 1 },
    )
    // Список внутренний (PersonalChats), но без лимита — «дай всё» тем же
    // запрещённым приёмом, что и у публичных списков (CLAUDE.md «API»).
    .limit(LIST_LIMIT_DEFAULT)
    .lean<
      { _id: Types.ObjectId; name: string; telegramId: number; roles: UserRole[] }[]
    >();
  return docs.map((doc) => ({
    id: doc._id.toString(),
    name: doc.name,
    telegramId: doc.telegramId,
    roles: doc.roles,
  }));
}
