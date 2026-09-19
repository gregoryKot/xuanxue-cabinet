// Штат школы с подтверждённым email (слой 4.7, PLAN.md §11, ADR-0039) — в
// отличие от list-contacts-with-roles.ts (`telegramId: { $exists: true }`,
// PersonalChats), этот запрос НЕ требует Telegram: почта — запасной канал
// именно для тех, кто бота не подключил вовсе, а не только для тех, у кого
// канал сейчас неактивен. `email` у пользователя есть только после входа по
// одноразовой ссылке (EmailLoginUserService) — то есть он подтверждён самим
// фактом входа, отдельного флага «confirmed» не требуется. Вынесено отдельным
// файлом тем же приёмом, что list-contacts-with-roles.ts: UsersService не
// растёт за 150 строк (CLAUDE.md «Храповики»).
import type { Model, Types } from 'mongoose';
import { LIST_LIMIT_DEFAULT, type UserRole } from '@xuanxue/shared';
import type { UserRecord } from './user.schema';

export interface StaffEmailContact {
  id: string;
  email: string;
  roles: UserRole[];
}

export async function listStaffWithEmail(
  model: Model<UserRecord>,
): Promise<StaffEmailContact[]> {
  const docs = await model
    .find(
      {
        email: { $exists: true },
        roles: { $in: ['teacher', 'assistant', 'admin'] },
      },
      { email: 1, roles: 1 },
    )
    // Тот же лимит-гейт, что у listContactsWithRoles — «дай всё» запрещено
    // даже для внутреннего использования (CLAUDE.md «API»).
    .limit(LIST_LIMIT_DEFAULT)
    .lean<{ _id: Types.ObjectId; email: string; roles: UserRole[] }[]>();
  return docs.map((doc) => ({
    id: doc._id.toString(),
    email: doc.email,
    roles: doc.roles,
  }));
}
