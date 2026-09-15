// Сравнение оценки «до» и «после» сохранения (аудит 2026-09, находка 3):
// PUT /attempts/:id/grading идемпотентен по записи (уникальный индекс
// attemptId, ExamGradingsService.grade), но раньше слал notifyExamGraded на
// каждый успешный вызов без разбора — повторный PUT с теми же значениями
// (учитель нажал «Сохранить», ответ не дошёл из-за сети, нажал ещё раз)
// удваивал ученику «Нужно доработать» (CLAUDE.md «Доставка идемпотентна»:
// повторяемое действие обязано быть идемпотентно и по побочному эффекту, не
// только по записи в базу). Сравниваем только outcome и comment —
// единственные поля, которые видит ученик в тексте (exam-graded-message.ts);
// баллы по критериям текст не меняют, их правка без смены outcome/comment
// уведомление не обязана провоцировать. Чистая логика, юнит-тест без Mongo
// и без DI (CLAUDE.md «Тесты»).
import type { ExamGradingDto, PutGradingInput } from '@xuanxue/shared';

export function didGradingChange(
  previous: ExamGradingDto | undefined,
  input: PutGradingInput,
): boolean {
  if (!previous) return true; // первая оценка попытки — уведомляем всегда
  if (previous.outcome !== input.outcome) return true;
  // '' и undefined — один и тот же «без комментария» для ученика.
  return (previous.comment ?? '') !== (input.comment ?? '');
}
