// Строка над формой оценки (AttemptReviewScreen.tsx) о том, куда уйдёт итог
// именно этому ученику. Раньше строка была одна и безусловная — «уйдёт в
// Telegram сразу после отправки». Владелец школы открыл работу ученика без
// Telegram и написал: «у этого ученика нет телеграмм» (отзыв 2026-09-21) —
// экран обещал канал, которого у адресата нет. Решение — ADR-0099: карточка
// несёт `notifiesUserInTelegram` (то самое условие, по которому реально шлёт
// `TelegramExamNotifier.notifyExamGraded`), а строка над формой — одна из
// двух в зависимости от него, а не общая формулировка на всех.
//
// Чистый модуль с тестом, а не тернарник в компоненте: CLAUDE.md требует
// логику вне компонентов, и в AttemptReviewScreen.tsx свободного места и так
// нет — 141 строка при пороге храповика `check-file-size-ratchet.mjs` в 150.
//
// Вторая строка называет «Задания», а не кабинет вообще: именно там ученик
// видит итог и комментарий на карточке экзамена (student/StudentExamCard.tsx,
// student/ExamAttemptOutcome.tsx). Запись в ленте кабинета при этом пишется
// всегда, независимо от Telegram (InAppExamNotifier, ADR-0061) — но это не
// повод указывать на ленту: конкретное место, где ученик увидит именно итог
// и комментарий проверки, — «Задания».
const TELEGRAM_HINT = 'Итог и комментарий уйдут ученику в Telegram сразу после отправки.';
const IN_APP_ONLY_HINT =
  'Итог и комментарий в Telegram не уйдут — ученик увидит их в кабинете, на «Заданиях».';

/** `notifiesUserInTelegram` — признак из `AttemptReviewDto` (shared), см. его
 * комментарий про `PersonalChats.chatFor`. */
export function gradingDeliveryHint(notifiesUserInTelegram: boolean): string {
  return notifiesUserInTelegram ? TELEGRAM_HINT : IN_APP_ONLY_HINT;
}
