// Уведомления — какие бывают виды, что человек получает по умолчанию по
// своим ролям и как выглядит контракт настройки (ТЗ notifications-api.md,
// отзыв владельца 2026-09-12). Общий контракт api/web/бота: DTO в api —
// `implements` типов ниже, расхождение ловит tsc (CLAUDE.md «Слои»).
//
// Условие входа в список (ADR-0069): у вида есть доставка сегодня либо она
// обещана этапом в docs/PLAN.md. Вид без того и другого — переключатель,
// который врёт: человек его включает и не получает ничего, а это тот самый
// тихий отказ, который в продукте про рассылки дороже всего (CLAUDE.md
// «Логи и наблюдаемость»). Так ушёл `teacher_message` (ADR-0062); `lesson_soon`
// ушёл тем же путём и вернулся с доставкой (ADR-0135, баг-репорт 2026-09-27).
// Доставка есть у каждого вида: `lesson_cancelled`, `recording_ready`,
// `material_new` и `payment_due` — шаги тика (ADR-0162, ADR-0150), `payments` —
// снимок перевода бухгалтеру (ADR-0156).
import { USER_ROLES, type UserRole } from './auth';

export const NOTIFICATION_KINDS = [
  'exam_result', // работу проверили — ученику (слой 4.7)
  'lesson_soon', // занятие скоро начнётся — ученику (ADR-0135)
  'lesson_cancelled', // учитель отменил занятие — ученику (ADR-0162)
  'recording_ready', // учитель добавил запись занятия — ученику, по желанию (ADR-0162)
  'material_new', // учитель добавил материал в библиотеку — ученику, по желанию (ADR-0162)
  'payment_due', // ежемесячное напоминание об оплате — ученику (ADR-0150, ADR-0157)
  'post_draft', // черновик поста перед занятием, с кнопкой «Исправить»
  'recording_request', // в минуту окончания занятия — «пришлите видео»
  'delivery_failed', // пост не ушёл в канал
  'attempt_submitted', // ученик сдал работу — ждёт проверки (слой 4.7)
  'payments', // оплаты и долги (этап 2, PLAN §15)
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
  exam_result: 'Результат экзамена',
  lesson_soon: 'Занятие скоро',
  lesson_cancelled: 'Занятие отменено',
  recording_ready: 'Запись занятия',
  material_new: 'Новый материал',
  payment_due: 'Напоминание об оплате',
  post_draft: 'Черновик поста',
  recording_request: 'Напоминание про запись',
  delivery_failed: 'Пост не ушёл',
  attempt_submitted: 'Работа на проверку',
  payments: 'Оплаты и долги',
  app_error: 'Сбой в кабинете',
};

/** Одна фраза «когда придёт» — в боте и в кабинете рядом с переключателем
 * (docs/VOICE.md: конкретика, форма «вы» там, где есть подлежащее). */
export const NOTIFICATION_HINTS: Record<NotificationKind, string> = {
  exam_result: 'Придёт, когда учитель проверит вашу работу и выставит результат.',
  lesson_soon: 'Придёт перед началом занятия — в кабинет и push-уведомлением на телефон.',
  lesson_cancelled:
    'Придёт сразу, как учитель отменит занятие, — в кабинет и push-уведомлением.',
  recording_ready:
    'Придёт, когда учитель добавит запись занятия, — в кабинет и push-уведомлением. ' +
    'Обычно выключено: включите, если смотрите записи.',
  material_new:
    'Придёт, когда учитель добавит в библиотеку материал к вашим занятиям, — в кабинет ' +
    'и push-уведомлением. Обычно выключено: включите, если следите за библиотекой.',
  post_draft: 'Придёт перед занятием — успеете поправить текст кнопкой «Исправить».',
  recording_request: 'Придёт в минуту, когда занятие закончится, — пришлите видео.',
  delivery_failed: 'Придёт, если пост не дошёл до канала.',
  attempt_submitted: 'Придёт, когда ученик сдаст экзамен, — работа ждёт вашей проверки.',
  payment_due: 'Придёт раз в месяц, в день оплаты.',
  payments: 'Придёт, когда ученик пришлёт скриншот перевода — боту или в кабинете.',
  app_error:
    'Придёт, когда кабинет сломается — на сервере или в браузере у человека. ' +
    'В сообщении будет код, по которому вы найдёте сбой в логах Railway.',
};

/** Дефолт по роли (отзыв владельца 2026-09-12): помощник учителя получает то
 * же, что учитель, — он равен учителю почти везде (shared/src/auth.ts).
 * Бухгалтер — только оплаты (`payments`). Ученик (без единой роли, ADR-0026)
 * сюда не входит: роли-ключа у него нет, его дефолт — `STUDENT_NOTIFICATIONS`.
 *
 * `attempt_submitted` (слой 4.7, PLAN §11) — только у учителя и помощника: они
 * проверяют работы. Админ получает набор учителя без этого вида: очередь чужих
 * экзаменов ему не нужна (отзыв владельца 2026-09-12) — первое расхождение,
 * поэтому общей переменной нет.
 *
 * `app_error` (отзыв владельца 2026-09-18) — только у админа: сбой кабинета
 * (ADR-0053, ADR-0071) чинит разработчик, но узнаёт о нём владелец школы, он же
 * единственный admin. Второе и последнее расхождение набора админа с учителем. */
export const DEFAULT_NOTIFICATIONS_BY_ROLE: Record<UserRole, NotificationKind[]> = {
  teacher: ['post_draft', 'recording_request', 'delivery_failed', 'attempt_submitted'],
  assistant: ['post_draft', 'recording_request', 'delivery_failed', 'attempt_submitted'],
  admin: ['post_draft', 'recording_request', 'delivery_failed', 'app_error'],
  accountant: ['payments'],
};

/** Дефолт ученика — человека без единой роли учителя (ADR-0026). Именованная
 * константа, не запись в `DEFAULT_NOTIFICATIONS_BY_ROLE`: тот `Record` ограничен
 * `UserRole`, а ученик — не роль. Виды «по желанию» — notification-availability.ts.
 *
 * Четыре вида, и у каждого доставка пришла вместе с ним (ADR-0069): результат
 * проверки работы (ADR-0062), напоминание о занятии (ADR-0135) и его отмена
 * (ADR-0162) — лента и push, напоминание об оплате (ADR-0150) — бот или лента.
 * Школьный выключатель `settings.paymentReminder.enabled` стоит выше личного:
 * пока школа его не включила, напоминание не приходит ни у кого. */
export const STUDENT_NOTIFICATIONS: NotificationKind[] = [
  'exam_result',
  'lesson_soon',
  'lesson_cancelled',
  'payment_due',
];

/** Дефолт для конкретного человека — объединение наборов всех его ролей
 * (роли равноправны, вторая роль только добавляет виды); без единой роли —
 * ученик (ADR-0026), `STUDENT_NOTIFICATIONS`. Порядок результата — всегда
 * канонический (`NOTIFICATION_KINDS`), не порядок объединения множеств. */
export function defaultNotifications(roles: UserRole[]): NotificationKind[] {
  if (roles.length === 0) return STUDENT_NOTIFICATIONS;
  const enabled = new Set<NotificationKind>();
  for (const role of roles) {
    for (const kind of DEFAULT_NOTIFICATIONS_BY_ROLE[role]) enabled.add(kind);
  }
  return NOTIFICATION_KINDS.filter((kind) => enabled.has(kind));
}

/** Роли, которым этот вид положен по умолчанию — кандидаты в получатели
 * (PersonalChats.listFor, api/src/telegram/personal-chats.ts). Штату вид, которого
 * нет по роли, включить нельзя: «Профиль» и `/notifications` в боте показывают
 * только виды по ролям (PLAN.md §13), так что дефолт роли — точная верхняя
 * граница получателей. Ученик — исключение: ему доступны ещё и необязательные
 * виды (`availableNotifications`), но ученических получателей ищут по людям без
 * ролей (LessonRecipientsService), не по этому списку. Порядок — по `USER_ROLES`. */
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
