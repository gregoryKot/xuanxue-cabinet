// Куда ведёт строка ленты (ADR-0070) — чистая функция без DOM и без сети.
// Адрес считается по виду уведомления, а не по роли зрителя: вид и так
// адресный — `exam_result` пишется ученику, `attempt_submitted` учителю
// (api/src/notifications/in-app-exam-notifier.ts), и роль сверх этого ничего
// не уточняет.
import type { NotificationDto } from '@xuanxue/shared';

// Итог проверки с комментарием учителя живёт на карточке экзамена в
// «Заданиях», а не на экране попытки: так уже решено в
// attempt/AttemptSubmitted.tsx («результат будет на карточке экзамена в
// кабинете»), и вторая точка показа итога разъехалась бы с первой.
const TASKS_PATH = '/tasks';
// Проверка одной работы — ROUTE_MODULES.attemptReview (web/src/app/routeModules.ts).
const GRADING_PATH = '/grading';

/** Адрес предмета строки; `undefined` — вести пока некуда. Вид без своего
 * экрана остаётся строкой без ссылки: ссылка в никуда обманывает и палец, и
 * клавиатуру (CLAUDE.md «Доступность»). */
export function notificationTarget(item: NotificationDto): string | undefined {
  if (item.kind === 'exam_result') return TASKS_PATH;
  if (item.kind === 'attempt_submitted' && item.attemptId) {
    return `${GRADING_PATH}/${item.attemptId}`;
  }
  return undefined;
}
