// Куда ведёт кнопка карточки задания (ADR-0119) — чистая функция с тестом
// (CLAUDE.md «Логика вне компонентов»).
//
// «Продолжить» (`getMyExamAction(exam) === 'continue'`) не должно звать
// `POST /exams/:id/attempts`: список `/me/exams` общий на всё приложение
// (MyExamsProvider.tsx, ADR-0063) и не перечитывается после каждой записи
// (ADR-0087) — устаревшая карточка ещё может думать, что попытка
// `in_progress`, уже после того как ученик её отправил, а тот же POST на уже
// отправленную попытку заводит НОВУЮ, пустую (`ExamAttemptsService.start`,
// exam-attempts.service.ts) и молча списывает попытку из лимита (отзыв
// тестировщика 2026-09-22: «кнопка продолжить, а ответы обнуляются»).
// «Продолжить» вместо этого открывает уже известную попытку по её `id`
// напрямую — худший исход устаревшего клика тогда просто экран уже
// отправленной попытки («Отправлено, ждём проверки»), а не сгоревшая попытка.
import { getMyExamAction, type MyExamDto } from '@xuanxue/shared';

export type TaskStartTarget = { kind: 'open'; attemptId: string } | { kind: 'start' };

export function resolveTaskStartTarget(exam: MyExamDto): TaskStartTarget {
  if (getMyExamAction(exam) === 'continue' && exam.lastAttempt) {
    return { kind: 'open', attemptId: exam.lastAttempt.id };
  }
  return { kind: 'start' };
}
