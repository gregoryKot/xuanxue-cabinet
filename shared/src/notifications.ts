// Уведомления — какие бывают виды, что человек получает по умолчанию по
// своим ролям и как выглядит контракт настройки (ТЗ notifications-api.md,
// отзыв владельца 2026-09-12). Это только контракт «что и кому» — сама
// отправка (планировщик, тексты, кнопка «Исправить») следующим слоем, здесь
// её нет. Общий контракт api/web/бота: DTO в api объявляется как `implements`
// типов ниже, расхождение ловит tsc (CLAUDE.md «Слои»).
import type { UserRole } from './auth';

export const NOTIFICATION_KINDS = [
  'lesson_soon', // занятие скоро — ученику
  'teacher_message', // сообщение от учителя — ученику
  'post_draft', // черновик поста перед занятием, с кнопкой «Исправить»
  'recording_request', // в минуту окончания занятия — «пришлите видео»
  'delivery_failed', // пост не ушёл в канал
  'payments', // оплаты и долги (этап 3)
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** Короткая подпись вида уведомления для экрана и бота — единственное место,
 * где перечислены названия (как `ROLE_LABELS` у ролей). */
export const NOTIFICATION_LABELS: Record<NotificationKind, string> = {
  lesson_soon: 'Занятие скоро',
  teacher_message: 'Сообщение от учителя',
  post_draft: 'Черновик поста',
  recording_request: 'Напоминание про запись',
  delivery_failed: 'Пост не ушёл',
  payments: 'Оплаты и долги',
};

/** Одна фраза «когда придёт» — её увидят и в боте, и в кабинете рядом с
 * переключателем (docs/VOICE.md: конкретика, форма «вы» там, где есть
 * подлежащее). */
export const NOTIFICATION_HINTS: Record<NotificationKind, string> = {
  lesson_soon: 'Придёт перед началом занятия — за сколько, настраивает школа.',
  teacher_message: 'Придёт, когда учитель напишет вам лично.',
  post_draft: 'Придёт перед занятием — успеете поправить текст кнопкой «Исправить».',
  recording_request: 'Придёт в минуту, когда занятие закончится, — пришлите видео.',
  delivery_failed: 'Придёт, если пост не дошёл до канала.',
  payments: 'Придёт, когда изменится оплата или долг ученика.',
};

/** Дефолт по роли (отзыв владельца 2026-09-12): помощник учителя получает
 * то же, что учитель, — он равен учителю почти везде (shared/src/auth.ts).
 * Бухгалтер — только оплаты, они ждут этапа 3 (docs/PLAN.md §4), но контракт
 * не откладываем — включать нечего, пока `payments` не отправляется. */
export const DEFAULT_NOTIFICATIONS_BY_ROLE: Record<UserRole, NotificationKind[]> = {
  student: ['lesson_soon', 'teacher_message'],
  teacher: ['post_draft', 'recording_request', 'delivery_failed'],
  assistant: ['post_draft', 'recording_request', 'delivery_failed'],
  admin: ['post_draft', 'recording_request', 'delivery_failed'],
  accountant: ['payments'],
};

/** Дефолт для конкретного человека — объединение наборов всех его ролей
 * (роли равноправны, вторая роль только добавляет виды). Человек без единой
 * роли (гость, SECURITY §2) дефолтится как ученик — так у него уже есть
 * осмысленный набор, если роль назначат позже. Порядок результата — всегда
 * канонический (`NOTIFICATION_KINDS`), не порядок объединения множеств. */
export function defaultNotifications(roles: UserRole[]): NotificationKind[] {
  if (roles.length === 0) return DEFAULT_NOTIFICATIONS_BY_ROLE.student;
  const enabled = new Set<NotificationKind>();
  for (const role of roles) {
    for (const kind of DEFAULT_NOTIFICATIONS_BY_ROLE[role]) enabled.add(kind);
  }
  return NOTIFICATION_KINDS.filter((kind) => enabled.has(kind));
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
