// Активные ученики — люди без единой роли (ADR-0026) и без блокировки —
// кандидаты в получатели напоминания о занятии (LessonReminderService,
// ADR-0135) и об оплате (PaymentReminderService, ADR-0150). Тот же приём, что
// list-active-with-roles.ts: вынесено отдельным файлом, чтобы UsersService не
// рос за лимит файла (CLAUDE.md «Храповики»).
// `roles: []` (пустой массив), не `$exists: false`/`$size: 0` порознь —
// поле у документа всегда есть (схема), просто пустое у ученика.
import type { Model, Types } from 'mongoose';
import { LIST_LIMIT_MAX } from '@xuanxue/shared';
import type { UserRecord } from './user.schema';

export interface ActiveStudent {
  id: string;
  // Имя нужно напоминанию об оплате («{имя}, напоминаем об оплате за …», ADR-0150);
  // поле открытое (user.schema.ts, plain), расшифровывать нечего.
  name: string;
}

export async function listActiveStudents(
  model: Model<UserRecord>,
): Promise<ActiveStudent[]> {
  const docs = await model
    .find({ roles: { $size: 0 }, status: 'active' }, { name: 1 })
    // Список внутренний, но без лимита незачем скроллить дальше первой
    // страницы — «дай всё» тем же запрещённым приёмом, что у публичных
    // списков (CLAUDE.md «API»); школа не настолько большая, чтобы упереться
    // в LIST_LIMIT_MAX учеников разом.
    .limit(LIST_LIMIT_MAX)
    .lean<{ _id: Types.ObjectId; name: string }[]>();
  return docs.map((doc) => ({ id: doc._id.toString(), name: doc.name }));
}
