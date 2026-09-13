// Проверки «школа не останется без администратора» — общие для
// UserRolesService.updateRoles и UserDeletionService.deleteAllUserData
// (CLAUDE.md «Дубли и мёртвый код»: один запрос, не копия в каждом сервисе).
//
// isLastAdmin — быстрая проверка ДО записи: считает других админов, не общее
// число (id в обоих вызывающих местах уже проверен как admin). Одной себя
// не защищает от гонки (аудит M11): между её countDocuments и условной
// записью, снимающей роль, есть окно, в которое конкурирующий запрос
// успевает снять admin у того самого «другого», которого эта проверка только
// что увидела, — тогда обе стороны прочли «есть ещё один» и обе прошли.
// rollbackIfNoAdminLeft закрывает это окно: вызывается СРАЗУ после записи,
// которая могла снять последнего админа, пересчитывает admin'ов заново по
// всей коллекции (без исключения себя — своя роль к этому моменту уже
// снята в базе) и, если ноль, откатывает эту же запись переданной функцией
// и отказывает. Из двух конкурирующих операций хотя бы одна доходит до этой
// перепроверки после того, как обе записи уже применились, — она видит ноль
// и откатывается; школа без администратора не остаётся ни при какой
// раскладке (доказательство и тесты — user-roles.service.spec.ts,
// user-deletion.service.spec.ts).
import type { Model } from 'mongoose';
import { LAST_ADMIN_MESSAGE } from '@xuanxue/shared';
import { ForbiddenError } from '../common/errors';
import type { UserRecord } from './user.schema';

export async function isLastAdmin(
  model: Model<UserRecord>,
  id: string,
): Promise<boolean> {
  const otherAdmins = await model.countDocuments({
    _id: { $ne: id },
    roles: 'admin',
  });
  return otherAdmins === 0;
}

/**
 * Перепроверка после уже выполненной записи, которая могла снять последнего
 * админа. `rollback` возвращает роль тем же условным апдейтом, которым её
 * сняли (см. вызывающих) — так откат не перезаписывает чужие правки, сделанные
 * между записью и этой перепроверкой.
 */
export async function rollbackIfNoAdminLeft(
  model: Model<UserRecord>,
  rollback: () => Promise<unknown>,
): Promise<void> {
  const adminsLeft = await model.countDocuments({ roles: 'admin' });
  if (adminsLeft > 0) return;
  await rollback();
  throw new ForbiddenError(LAST_ADMIN_MESSAGE);
}
