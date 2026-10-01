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
// Ближайшие занятия ученика — student/LessonsScreen.tsx (ADR-0135): то же
// место, куда ведёт пункт меню «Занятия», отдельного экрана под одно
// напоминание не заводим. Отмену занятия (ADR-0162) ведёт туда же: отменённое
// занятие остаётся в расписании с пометкой (StudentLessonCard).

const LESSONS_PATH = '/lessons';
// «Записи занятий» ученика (ROUTE_MODULES.archive, слой 3.3): запись, о которой
// сообщила лента (`recording_ready`, ADR-0162), лежит там, не на «Занятиях».
const ARCHIVE_PATH = '/archive';
// «Библиотека» ученика (ROUTE_MODULES.library): новый материал (`material_new`,
// ADR-0162) лежит там. К самому материалу строка не ведёт: у библиотеки нет адреса
// на одну запись, а свежий материал идёт в списке первым.
const LIBRARY_PATH = '/library';

// payment_due (ADR-0150) сознательно без адреса: экран ученика с оплатой —
// слой 2.4 PLAN §15, пока его нет, ссылка вела бы в никуда. Когда экран
// появится, здесь добавится ветка на него, а строки, уже лежащие в ленте,
// подхватят ссылку сами: адрес считается на чтении по виду.

/** Адрес предмета строки; `undefined` — вести пока некуда. Вид без своего
 * экрана остаётся строкой без ссылки: ссылка в никуда обманывает и палец, и
 * клавиатуру (CLAUDE.md «Доступность»). */
export function notificationTarget(item: NotificationDto): string | undefined {
  if (item.kind === 'exam_result') return TASKS_PATH;
  if (item.kind === 'lesson_soon' || item.kind === 'lesson_cancelled') {
    return LESSONS_PATH;
  }
  if (item.kind === 'recording_ready') return ARCHIVE_PATH;
  if (item.kind === 'material_new') return LIBRARY_PATH;
  if (item.kind === 'attempt_submitted' && item.attemptId) {
    return `${GRADING_PATH}/${item.attemptId}`;
  }
  return undefined;
}
