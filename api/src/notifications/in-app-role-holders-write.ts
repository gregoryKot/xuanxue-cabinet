// Запись строки ленты всем, у кого по роли есть вид уведомления, — БЕЗ
// проверки личного переключателя (ADR-0156). Это страховка на случай, когда
// Telegram-доставка не дошла: снимок перевода, присланный учеником, никто не
// увидел, а бухгалтер мог не подключить бота или выключить вид `payments`
// именно поэтому — «выключил вид» не должно значить «потерял снимок».
// Переключатель уважает `writeToStaff` (in-app-staff-write.ts) там, где строка
// ленты — обычное уведомление о событии; здесь строка — последний рубеж.
//
// Кабинет не требует канала связи (ADR-0061), поэтому получатели — любые
// активные люди с ролью, как в `writeToStaff`, а не PersonalChats.
import type { Model } from 'mongoose';
import { rolesWithNotification } from '@xuanxue/shared';
import type { UsersService } from '../users/users.service';
import { writeNotificationRow, type WriteInput } from './in-app-staff-write';
import type { NotificationRecord } from './notification.schema';

/** Сколько человек получили строку — ноль означает «в школе нет никого с
 * такой ролью», не ошибку. Идентичность строки (месяц, попытка…) — как у
 * `writeNotificationRow`: повтор по тому же ключу поднимает её непрочитанной. */
export async function writeToRoleHolders(
  usersService: UsersService,
  model: Model<NotificationRecord>,
  input: Omit<WriteInput, 'userId'>,
): Promise<number> {
  const holders = await usersService.listActiveWithRoles(
    rolesWithNotification(input.kind),
  );
  await Promise.all(
    holders.map((holder) => writeNotificationRow(model, { userId: holder.id, ...input })),
  );
  return holders.length;
}
