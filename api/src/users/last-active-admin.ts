// Проверка «не последний активный администратор» для
// UserStatusService.updateStatus — отдельно от last-admin.ts (не трогать:
// та пара функций защищает необратимые операции, снятие роли и удаление
// данных, и поэтому закрывает гонку двух проверок перепроверкой ПОСЛЕ
// записи, rollbackIfNoAdminLeft).
//
// Здесь такая перепроверка не нужна: блокировка обратима — открыть доступ
// обратно (status: 'active') можно в любой момент, в том числе себе самому
// (updateStatus не ограничивает переход в 'active'). Даже если гонка двух
// одновременных блокировок пройдёт дешёвую проверку ниже одновременно и
// школа на мгновение останется без активного админа, вернуть доступ можно
// следующим же запросом — в отличие от снятия роли или удаления данных,
// откатывать здесь нечего.
//
// Считаем только активных админов (status: 'active') — заблокированный
// admin не может зайти в кабинет и открыть чужой доступ, значит в счёт
// «кто вернёт доступ школе» не идёт.
import type { Model } from 'mongoose';
import type { UserRecord } from './user.schema';

export async function isLastActiveAdmin(
  model: Model<UserRecord>,
  id: string,
): Promise<boolean> {
  const otherActiveAdmins = await model.countDocuments({
    _id: { $ne: id },
    roles: 'admin',
    status: 'active',
  });
  return otherActiveAdmins === 0;
}
