// Режимы «действующих ролей» (ADR-0163 — режим ученика, ADR-0190 — режим
// учителя): единственное место, где роли «действующие» отличаются от настоящих.
// Настоящие роли лежат в БД и не меняются — их читают «Люди», защита последнего
// админа и бот. Действующие — те, что видит всё, что идёт после AuthGuard:
// `@Roles`, `isStaffRole` в выборках, дефолты уведомлений, `MeDto.roles`.
//
// Режим только убавляет права. Ученик: из любых ролей получается `[]`. Учитель:
// получается `['teacher']`, и это сужение лишь потому, что права учителя везде
// входят в права админа: каждый `@Roles(...)` с `'teacher'` содержит и `'admin'`.
// Типы этого не выражают — держит гейт `auth/teacher-roles-invariant.spec.ts`
// (читает метаданные всех контроллеров): новый маршрут «только учителю» без
// админа уронит тесты, а не откроет админу в режиме то, чего у него нет.
import { isStaffRole, USER_ROLES, type UserRole } from '@xuanxue/shared';

/** Роли штата списком — для фильтров Mongo (`roles: { $in }`), где `isStaffRole`
 * не вызвать. Выводится из `isStaffRole`, а не переписывается заново: список
 * штата в shared один, и две копии разошлись бы на первой же новой роли. */
export const STAFF_ROLE_LIST: readonly UserRole[] = USER_ROLES.filter((role) =>
  isStaffRole([role]),
);

/** Роль, которую кабинет показывает админу в режиме учителя (ADR-0190). */
const TEACHER_MODE_ROLE: UserRole = 'teacher';

/** Режим ученика включён: момент записан (`users.studentModeAt`) И настоящая роль
 * штата на месте. Второе условие — страховка от застрявшего флага: если роли
 * сняли мимо экрана «Люди» (правка в Atlas), бывший учитель режимом не «залипает»,
 * а человек, которому штат вернули, не просыпается в нём сам. Вызывает только
 * `toLean` — единственный маппер документа в `UserLean`. */
export function isStudentModeOn(
  studentModeAt: Date | undefined,
  roles: readonly UserRole[],
): boolean {
  return studentModeAt != null && isStaffRole(roles);
}

/** Режим учителя включён: момент записан (`users.teacherModeAt`) И настоящая роль
 * `admin` на месте. Страховка та же, что у `isStudentModeOn`: флаг, застрявший у
 * того, кто больше не админ, режимом не считается — иначе бывший разработчик
 * остался бы с кабинетом учителя, которого ему никто не давал. */
export function isTeacherModeOn(
  teacherModeAt: Date | undefined,
  roles: readonly UserRole[],
): boolean {
  return teacherModeAt != null && roles.includes('admin');
}

/** Режимы по ключу: общий язык сервиса, контроллера и `activeMode`. */
export type ActingModeKey = 'student' | 'teacher';

interface ModeFlags {
  studentMode: boolean;
  teacherMode: boolean;
}

/** Какой режим действует сейчас. Оба флага разом в базе не бывают — запись
 * одного снимает другой тем же апдейтом, — но правка в Atlas это допускает; тогда
 * побеждает ученик: пустые роли — самое узкое, что режим умеет, а не случайный
 * выбор из двух. */
export function activeMode(user: ModeFlags): ActingModeKey | null {
  if (user.studentMode) return 'student';
  return user.teacherMode ? 'teacher' : null;
}

/** Человек глазами остального кабинета: в режиме ученика роли пустые, в режиме
 * учителя — `['teacher']`, иначе тот же объект. Идемпотентна — повторный вызов на
 * уже маскированном ничего не меняет, поэтому `toMeDto` зовёт её сам и для
 * человека из БД (вход), и для того, кого уже замаскировал `AuthGuard`.
 * Обобщённая, а не `UserLean → UserLean`, чтобы не тянуть `users.service` обратно
 * в этот файл (`toLean` импортирует отсюда). */
export function actingUser<T extends ModeFlags & { roles: UserRole[] }>(user: T): T {
  const mode = activeMode(user);
  if (mode === 'student') return { ...user, roles: [] };
  if (mode === 'teacher') return { ...user, roles: [TEACHER_MODE_ROLE] };
  return user;
}
