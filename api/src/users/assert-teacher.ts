// Проверка leaderId перед сохранением класса/даты занятия (аудит В4:
// «{ведущий} невозможно заполнить из интерфейса» — раньше leaderId
// принимался как есть, без проверки, что это существующий учитель).
// Общая для ClassesService.create/update и LessonsService.update
// (CLAUDE.md «Одна механика — один компонент», jscpd) — обе стороны шлют
// один и тот же leaderId в теле запроса. Модель, не UsersService: сервисам
// нужна одна проверка существования, разворачивать её в отдельный поход
// через UsersService.findById и сравнение полей вручную — лишний слой.
import { Model, Types } from 'mongoose';
import { LEADER_NOT_FOUND_MESSAGE } from '@xuanxue/shared';
import { InvalidInputError } from '../common/errors';
import type { UserRecord } from './user.schema';

export async function assertTeacherExists(
  model: Model<UserRecord>,
  leaderId: string,
): Promise<void> {
  // Невалидный ObjectId не должен долетать до Mongo как есть — сообщение
  // то же самое, что и «не нашли»: с точки зрения учителя разницы нет.
  if (!Types.ObjectId.isValid(leaderId)) {
    throw new InvalidInputError(LEADER_NOT_FOUND_MESSAGE);
  }
  const exists = await model.exists({
    _id: leaderId,
    roles: { $in: ['teacher', 'admin'] },
    status: 'active',
  });
  if (!exists) throw new InvalidInputError(LEADER_NOT_FOUND_MESSAGE);
}

/** Обёртка для PATCH: поля нет в теле — не трогаем; `null` — явный сброс
 * ведущего (NULLABLE_CLASS_FIELDS/NULLABLE_LESSON_FIELDS), проверять
 * нечего. Один и тот же выбор в ClassesService.update и LessonsService.update
 * (CLAUDE.md «Одна механика», jscpd) — второй копии условия не заводим. */
export async function assertLeaderIdIfProvided(
  model: Model<UserRecord>,
  leaderId: string | null | undefined,
): Promise<void> {
  if (leaderId === undefined || leaderId === null) return;
  await assertTeacherExists(model, leaderId);
}
