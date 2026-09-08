// Общая проверка «остался бы хоть один админ» — вынесена из
// UserRolesService.updateRoles, чтобы UserDeletionService не копировал тот
// же запрос (CLAUDE.md «Дубли и мёртвый код»). Считает других админов, не
// общее число: `id` в обоих вызывающих местах уже проверен как admin —
// интересует, остаётся ли школа хоть с одним, если убрать роль/аккаунт
// именно у него. Не защищает от гонки, когда два запроса снимают роль друг
// у друга в один момент (оба видят «есть ещё один» и проходят проверку) —
// школа маленькая, действие редкое, полноценная блокировка (транзакция) для
// этого случая не стоит своей сложности сейчас; если вырастет — усилить, как
// markSent в deliveries (комментарий унаследован из исходного места).
import type { Model } from 'mongoose';
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
