// Текст письма ученику «работу проверили» (слой 4.7, PLAN §11, ADR-0039) —
// почтовый резерв TelegramExamNotifier.notifyExamGraded: те же три фразы
// исхода, что и в боте (exam-graded-message.ts) и на карточке ученика в
// кабинете (web/src/student/examAttemptState.ts) — разные слова читались бы
// как разные решения. Комментарий учителя — как есть, свой текст мы не
// правим (CLAUDE.md «Обращение — только „вы“»). Чистая логика, без Mongo и
// DI (CLAUDE.md «Тесты»).
import type { GradingOutcome } from '@xuanxue/shared';
import type { ExamMail } from './attempt-submitted-mail';

const OUTCOME_LABELS: Record<GradingOutcome, string> = {
  passed: 'Экзамен сдан.',
  failed: 'Экзамен не сдан.',
  needs_work: 'Нужно доработать.',
};

export function examGradedMail(
  examTitle: string,
  outcome: GradingOutcome,
  comment: string | undefined,
  publicUrl: string | undefined,
): ExamMail {
  const lines = [
    'Здравствуйте!',
    '',
    `Учитель проверил вашу работу по «${examTitle}». ${OUTCOME_LABELS[outcome]}`,
  ];
  if (comment) lines.push('', comment);
  if (publicUrl) lines.push('', `Кабинет: ${publicUrl}`);
  return { subject: `Результат экзамена: ${examTitle}`, text: lines.join('\n') };
}
