// Режим ученика для штата (ADR-0163): единственное место, где роли «действующие»
// отличаются от настоящих. Настоящие роли лежат в БД и не меняются — их читают
// «Люди», защита последнего админа и бот. Действующие — те, что видит всё,
// что идёт после AuthGuard: `@Roles`, `isStaffRole` в выборках, дефолты
// уведомлений, `MeDto.roles`.
//
// Режим только убавляет права: из любых ролей он делает `[]`, и никак иначе.
// Прибавить роль через него нельзя — расширение прав (SECURITY §2) здесь
// физически не выразимо.
import { isStaffRole, USER_ROLES, type UserRole } from '@xuanxue/shared';

/** Роли штата списком — для фильтров Mongo (`roles: { $in }`), где `isStaffRole`
 * не вызвать. Выводится из `isStaffRole`, а не переписывается заново: список
 * штата в shared один, и две копии разошлись бы на первой же новой роли. */
export const STAFF_ROLE_LIST: readonly UserRole[] = USER_ROLES.filter((role) =>
  isStaffRole([role]),
);

/** Режим включён: момент записан (`users.studentModeAt`) И настоящая роль штата
 * на месте. Второе условие — страховка от застрявшего флага: если роли
 * сняли мимо экрана «Люди» (правка в Atlas), бывший учитель режимом не «залипает»,
 * а человек, которому штат вернули, не просыпается в нём сам. Вызывает только
 * `toLean` — единственный маппер документа в `UserLean`. */
export function isStudentModeOn(
  studentModeAt: Date | undefined,
  roles: readonly UserRole[],
): boolean {
  return studentModeAt != null && isStaffRole(roles);
}

/** Человек глазами остального кабинета: в режиме ученика роли пустые, иначе тот
 * же объект. Идемпотентна — повторный вызов на уже маскированном ничего не
 * меняет, поэтому `toMeDto` зовёт её сам и для человека из БД (вход), и для
 * того, кого уже замаскировал `AuthGuard`. Обобщённая, а не `UserLean →
 * UserLean`, чтобы не тянуть `users.service` обратно в этот файл (`toLean`
 * импортирует отсюда). */
export function actingUser<T extends { roles: UserRole[]; studentMode: boolean }>(
  user: T,
): T {
  return user.studentMode ? { ...user, roles: [] } : user;
}
