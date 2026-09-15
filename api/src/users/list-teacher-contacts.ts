// Учителя, помощники учителя и админы с подключённым Telegram — кому бот
// вообще может писать (PersonalChats, api/src/telegram/personal-chats.ts,
// PLAN.md §6): помощник учителя правами равен учителю, поэтому в списке —
// дальше PersonalChats сверяет каждого с активным личным каналом и с его
// настройкой уведомлений (roles — для дефолта по роли, listFor). Бухгалтер
// и ученик сюда не попадают — бот с ними проактивно не говорит. Вынесено из
// users.service.ts отдельным файлом тем же приёмом, что upsert-user-by-key.ts:
// сервис не растёт за 150 строк (file-size-ratchet, ревью владельца 2026-09-15).
import type { Model, Types } from 'mongoose';
import { LIST_LIMIT_DEFAULT, type UserRole } from '@xuanxue/shared';
import type { UserRecord } from './user.schema';

export interface TeacherContact {
  id: string;
  name: string;
  telegramId: number;
  roles: UserRole[];
}

export async function listTeacherContacts(
  model: Model<UserRecord>,
): Promise<TeacherContact[]> {
  const docs = await model
    .find(
      {
        telegramId: { $exists: true },
        roles: { $in: ['teacher', 'assistant', 'admin'] },
      },
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
