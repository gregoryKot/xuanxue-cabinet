// Текст DM ученику «работу проверили» (слой 4.7, PLAN §11) — чистая логика,
// без Mongo и DI (CLAUDE.md «Тесты», образец — broadcast-cancel-message.ts).
// Итог — качественный, без баллов (PLAN §11 «Границы», ADR-0038): ученик
// читает одно и то же решение и в боте, и в кабинете.
// Комментарий учителя — как есть, свой текст мы не правим (CLAUDE.md
// «Обращение — только „вы“»: тексты учителя — его голос).
import type { GradingOutcome } from '@xuanxue/shared';

// Те же три фразы, что на карточке ученика в кабинете
// (web/src/student/examAttemptState.ts, describeOutcome): человек читает про
// один и тот же итог в боте и на экране — разные слова читались бы как
// разные решения.
const OUTCOME_LABELS: Record<GradingOutcome, string> = {
  passed: 'Экзамен сдан.',
  failed: 'Экзамен не сдан.',
  needs_work: 'Нужно доработать.',
};

export function examGradedMessage(
  examTitle: string,
  outcome: GradingOutcome,
  comment: string | undefined,
  publicUrl: string | undefined,
): string {
  const lines = [
    `Учитель проверил вашу работу по «${examTitle}». ${OUTCOME_LABELS[outcome]}`,
  ];
  if (comment) lines.push(comment);
  if (publicUrl) lines.push(`Кабинет: ${publicUrl}`);
  return lines.join('\n\n');
}
