// Активные ученики — люди без единой роли (ADR-0026) и без блокировки —
// кандидаты в получатели напоминания о занятии (LessonReminderService,
// ADR-0135) и об оплате (PaymentReminderService, ADR-0150). По умолчанию —
// только настоящие ученики; штат в режиме ученика добавляет `includeStudentMode`
// (ADR-0163), и каждый вызывающий решает это сам. Тот же приём, что
// list-active-with-roles.ts: вынесено отдельным файлом, чтобы UsersService не
// рос за лимит файла (CLAUDE.md «Храповики»).
// `roles: []` (пустой массив), не `$exists: false`/`$size: 0` порознь —
// поле у документа всегда есть (схема), просто пустое у ученика.
import type { Model, Types } from 'mongoose';
import { LIST_LIMIT_MAX } from '@xuanxue/shared';
import { STAFF_ROLE_LIST } from './student-mode';
import type { UserRecord } from './user.schema';

export interface ActiveStudent {
  id: string;
  // Имя нужно напоминанию об оплате («{имя}, напоминаем об оплате за …», ADR-0150);
  // поле открытое (user.schema.ts, plain), расшифровывать нечего.
  name: string;
}

export interface ListActiveStudentsOptions {
  /** Добавить штат в режиме ученика (`users.studentModeAt`, ADR-0163). Только для
   * того, что человек видит и получает как ученик: напоминания о занятиях,
   * отмены, записи, материалы (LessonRecipientsService). Всё, что про деньги
   * и статистику школы, зовёт без флага — режим «понарошку», настоящих учеников
   * из него не получается (оплаты, число на «Шаблонах»). */
  includeStudentMode?: boolean;
}

/** Фильтр «человек в режиме ученика» повторяет `isStudentModeOn`
 * (users/student-mode.ts): флаг стоит И настоящая роль штата на месте. */
const IN_STUDENT_MODE = {
  studentModeAt: { $exists: true },
  roles: { $in: STAFF_ROLE_LIST },
};

export async function listActiveStudents(
  model: Model<UserRecord>,
  { includeStudentMode = false }: ListActiveStudentsOptions = {},
): Promise<ActiveStudent[]> {
  const isStudent = { roles: { $size: 0 } };
  const docs = await model
    .find(
      {
        status: 'active',
        ...(includeStudentMode ? { $or: [isStudent, IN_STUDENT_MODE] } : isStudent),
      },
      { name: 1 },
    )
    // Список внутренний, но без лимита незачем скроллить дальше первой
    // страницы — «дай всё» тем же запрещённым приёмом, что у публичных
    // списков (CLAUDE.md «API»); школа не настолько большая, чтобы упереться
    // в LIST_LIMIT_MAX учеников разом.
    .limit(LIST_LIMIT_MAX)
    .lean<{ _id: Types.ObjectId; name: string }[]>();
  return docs.map((doc) => ({ id: doc._id.toString(), name: doc.name }));
}
