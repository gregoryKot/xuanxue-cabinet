// «Доступно, но выключено по умолчанию» (ADR-0162, п. 4). До этого у человека
// было ровно два состояния вида: положен по роли (виден в настройках, включён
// сам) и не положен (не виден вовсе). «Запись занятия» и «Новый материал»
// ученику нужны не всем: обо всех занятиях это до 16 уведомлений в неделю
// сверх напоминаний, а смотрят записи и библиотеку единицы. Поэтому вид показан
// в настройках ученика выключенным, а включает его сам человек — переключатель
// в «Что присылать» и в боте.
// Отдельный файл, а не дописанный `notifications.ts`: тот стоит на границе
// храповика размера (150 строк).
import {
  NOTIFICATION_KINDS,
  defaultNotifications,
  type NotificationKind,
} from './notifications';
import type { UserRole } from './auth';

/** Виды, которые ученик видит в настройках и может включить, но которые не
 * приходят сами. Не пересекаются с `STUDENT_NOTIFICATIONS` (spec): вид в обоих
 * списках был бы включён сам и «по желанию» одновременно. Включённый вид
 * лежит в `notification_prefs.overrides` как `enabled: true` — `applyOverrides`
 * умеет добавлять вид сверх дефолта, отдельного хранения не нужно. У каждого
 * вида здесь есть шаг тика с доставкой (ADR-0069). */
export const STUDENT_OPTIONAL_NOTIFICATIONS: NotificationKind[] = [
  'recording_ready',
  'material_new',
];

/** Что человек видит в настройках: дефолт его ролей плюс, для ученика, виды
 * «по желанию». Штату необязательных видов пока нет — для него это то же, что
 * `defaultNotifications`. Порядок результата — канонический
 * (`NOTIFICATION_KINDS`), как у дефолта. Кто получит уведомление, решает не
 * этот список, а включённость (`enabled` из `GET /me/notifications`). */
export function availableNotifications(roles: UserRole[]): NotificationKind[] {
  const available = new Set(defaultNotifications(roles));
  if (roles.length === 0) {
    for (const kind of STUDENT_OPTIONAL_NOTIFICATIONS) available.add(kind);
  }
  return NOTIFICATION_KINDS.filter((kind) => available.has(kind));
}
