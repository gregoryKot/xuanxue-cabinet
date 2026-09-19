// Уведомления — какие бывают виды, что человек получает по умолчанию по
// своим ролям и как выглядит контракт настройки (ТЗ notifications-api.md,
// отзыв владельца 2026-09-12). Это только контракт «что и кому» — сама
// отправка (планировщик, тексты, кнопка «Исправить») следующим слоем, здесь
// её нет. Общий контракт api/web/бота: DTO в api объявляется как `implements`
// типов ниже, расхождение ловит tsc (CLAUDE.md «Слои»).
import { USER_ROLES, type UserRole } from './auth';

export const NOTIFICATION_KINDS = [
  'lesson_soon', // занятие скоро — ученику
  'teacher_message', // сообщение от учителя — ученику
  'exam_result', // работу проверили — ученику (слой 4.7)
  'post_draft', // черновик поста перед занятием, с кнопкой «Исправить»
  'recording_request', // в минуту окончания занятия — «пришлите видео»
  'delivery_failed', // пост не ушёл в канал
  'attempt_submitted', // ученик сдал работу — ждёт проверки (слой 4.7)
  'payments', // оплаты и долги (этап 3)
  'app_error', // сбой в кабинете — админу
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** Валидатор параметра из внешнего входа (callback data бота, query) — один
 * guard на весь проект, не по одной проверке `includes` на каждого потребителя. */
export function isNotificationKind(value: string): value is NotificationKind {
  return (NOTIFICATION_KINDS as readonly string[]).includes(value);
}

/** Короткая подпись вида уведомления для экрана и бота — единственное место,
 * где перечислены названия (как `ROLE_LABELS` у ролей). */
export const NOTIFICATION_LABELS: Record<NotificationKind, string> = {
  lesson_soon: 'Занятие скоро',
  teacher_message: 'Сообщение от учителя',
  exam_result: 'Результат экзамена',
  post_draft: 'Черновик поста',
  recording_request: 'Напоминание про запись',
  delivery_failed: 'Пост не ушёл',
  attempt_submitted: 'Работа на проверку',
  payments: 'Оплаты и долги',
  app_error: 'Сбой в кабинете',
};

/** Одна фраза «когда придёт» — её увидят и в боте, и в кабинете рядом с
 * переключателем (docs/VOICE.md: конкретика, форма «вы» там, где есть
 * подлежащее). */
export const NOTIFICATION_HINTS: Record<NotificationKind, string> = {
  lesson_soon: 'Придёт перед началом занятия — за сколько, настраивает школа.',
  teacher_message: 'Придёт, когда учитель напишет вам лично.',
  exam_result: 'Придёт, когда учитель проверит вашу работу и выставит результат.',
  post_draft: 'Придёт перед занятием — успеете поправить текст кнопкой «Исправить».',
  recording_request: 'Придёт в минуту, когда занятие закончится, — пришлите видео.',
  delivery_failed: 'Придёт, если пост не дошёл до канала.',
  attempt_submitted: 'Придёт, когда ученик сдаст экзамен, — работа ждёт вашей проверки.',
  payments: 'Придёт, когда изменится оплата или долг ученика.',
  app_error:
    'Придёт вам, если в кабинете случится ошибка сервера — с кодом, ' +
    'по которому вы найдёте её в логах Railway.',
};

/** Дефолт по роли (отзыв владельца 2026-09-12): помощник учителя получает
 * то же, что учитель, — он равен учителю почти везде (shared/src/auth.ts).
 * Бухгалтер — только оплаты, они ждут этапа 3 (docs/PLAN.md §4), но контракт
 * не откладываем — включать нечего, пока `payments` не отправляется. Ученик
 * (человек без единой роли отсюда, ADR-0026) сюда не входит — у него нет
 * роли, чтобы быть ключом `Record<UserRole, …>`, его дефолт — отдельная
 * константа `STUDENT_NOTIFICATIONS` ниже.
 *
 * `attempt_submitted` (слой 4.7, PLAN §11) — только у учителя и помощника:
 * они проверяют работы, очередь проверки — их дело. Админ получает тот же
 * набор, что учитель, без этого вида: он не проверяет работы, и очередь
 * чужих экзаменов ему не нужна (отзыв владельца 2026-09-12) — первое
 * расхождение набора админа с учителем, поэтому дальше не выражено общей
 * переменной, а прямо видно построчно.
 *
 * `app_error` (отзыв владельца 2026-09-18 «а куда приходят ошибки?») —
 * наоборот, только у админа: неизвестную ошибку сервера чинит разработчик,
 * но узнаёт о ней владелец школы, он же единственный admin, — учителю,
 * помощнику и бухгалтеру чинить нечего, будильник в кармане им не нужен.
 * Второе и последнее расхождение набора админа с учителем. */
export const DEFAULT_NOTIFICATIONS_BY_ROLE: Record<UserRole, NotificationKind[]> = {
  teacher: ['post_draft', 'recording_request', 'delivery_failed', 'attempt_submitted'],
  assistant: ['post_draft', 'recording_request', 'delivery_failed', 'attempt_submitted'],
  admin: ['post_draft', 'recording_request', 'delivery_failed', 'app_error'],
  accountant: ['payments'],
};

/** Дефолт ученика — человека без единой роли учителя (ADR-0026). Именованная
 * константа, не запись в `DEFAULT_NOTIFICATIONS_BY_ROLE`: тот `Record`
 * ограничен `UserRole`, а ученик — не роль. */
export const STUDENT_NOTIFICATIONS: NotificationKind[] = [
  'lesson_soon',
  'teacher_message',
  'exam_result',
];

/** Дефолт для конкретного человека — объединение наборов всех его ролей
 * (роли равноправны, вторая роль только добавляет виды). Человек без единой
 * роли — ученик (ADR-0026) — получает `STUDENT_NOTIFICATIONS`. Порядок
 * результата — всегда канонический (`NOTIFICATION_KINDS`), не порядок
 * объединения множеств. */
export function defaultNotifications(roles: UserRole[]): NotificationKind[] {
  if (roles.length === 0) return STUDENT_NOTIFICATIONS;
  const enabled = new Set<NotificationKind>();
  for (const role of roles) {
    for (const kind of DEFAULT_NOTIFICATIONS_BY_ROLE[role]) enabled.add(kind);
  }
  return NOTIFICATION_KINDS.filter((kind) => enabled.has(kind));
}

/** Роли, которым этот вид уведомления положен по умолчанию — кандидаты в
 * получатели (PersonalChats.listFor, api/src/telegram/personal-chats.ts).
 * Почему кандидаты — именно дефолт роли, а не «все подряд, дальше отфильтрует
 * NotificationPrefsService»: переключатель вида человек может выключить, но
 * не может ВКЛЮЧИТЬ вид, которого у него нет по ролям — экран «Профиль»
 * (`NotificationPrefsSection`) и команда `/notifications` в боте показывают
 * только виды, доступные по ролям (PLAN.md §13). Значит дефолт роли — точная
 * верхняя граница множества получателей, а не приближение: расширять поиск
 * шире него незачем, там просто некому быть найденным. Порядок результата —
 * канонический по `USER_ROLES` (тот же приём, что у `defaultNotifications` с
 * `NOTIFICATION_KINDS`), не порядок обхода объекта. */
export function rolesWithNotification(kind: NotificationKind): UserRole[] {
  return USER_ROLES.filter((role) => DEFAULT_NOTIFICATIONS_BY_ROLE[role].includes(kind));
}

/** То, что реально придёт человеку сейчас — дефолт роли с наложенными
 * переключениями (`GET /me/notifications`). */
export interface NotificationPrefsDto {
  enabled: NotificationKind[];
}

/** Тело `PATCH /me/notifications` — один переключатель за раз. */
export interface UpdateNotificationPrefsInput {
  kind: NotificationKind;
  enabled: boolean;
}
