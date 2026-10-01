// Общий первый шаг двух нотификаторов, которые шлют ОДНОМУ конкретному
// человеку по userId (не по роли, как writeToStaff/in-app-staff-write.ts):
// InAppExamNotifier.notifyExamGraded и PushExamNotifier.notifyExamGraded
// (оба — «работу проверили», ADR-0061/ADR-0092). Вынесено отдельным файлом,
// когда jscpd поймал буквальный повтор этих четырёх строк в обоих местах
// (CLAUDE.md «Дубли»: повторяешь блок — в модуль).
import type { NotificationKind } from '@xuanxue/shared';
import type { NotificationPrefsService } from './notification-prefs.service';
import { actingUser } from '../users/student-mode';
import type { UserLean, UsersService } from '../users/users.service';

export interface NotifiedUserDeps {
  usersService: UsersService;
  notificationPrefsService: NotificationPrefsService;
}

/** Человек — адресат вида `kind`, если аккаунт существует и вид сейчас
 * включён (дефолт роли + личные переключения). `null` — не ошибка: аккаунт
 * удалили или человек выключил вид, вызывающий код читает это как «некому». */
export async function findNotifiedUser(
  deps: NotifiedUserDeps,
  userId: string,
  kind: NotificationKind,
): Promise<UserLean | null> {
  const user = await deps.usersService.findById(userId);
  if (!user) return null;

  // Действующие роли, не настоящие: «работу проверили» уходит в ленту и push
  // кабинета, а там штат в режиме ученика — ученик (ADR-0163) и ждёт виды
  // ученика. Бот остаётся штатным (PersonalChats.chatFor читает настоящие роли).
  const prefs = await deps.notificationPrefsService.get(user.id, actingUser(user).roles);
  return prefs.enabled.includes(kind) ? user : null;
}
