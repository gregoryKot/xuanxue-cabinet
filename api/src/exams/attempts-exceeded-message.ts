// Текст отказа «превышен лимит попыток» (ТЗ 4.4, п.2) — чистая функция,
// вынесена из exam-attempts.service.ts (CLAUDE.md «Файлы»: сервис дробится
// на файлы, а не раздувается).
import { pluralRu } from '@xuanxue/shared';

// Склонение «попытки» — своя форма, отдельная от QUESTION_FORMS (exam-blocks.ts).
const ATTEMPT_FORMS = {
  one: 'попытку',
  few: 'попытки',
  many: 'попыток',
  other: 'попытки',
} as const;

export function attemptsExceededMessage(attemptsUsed: number): string {
  return (
    `Вы использовали ${attemptsUsed} ${pluralRu(attemptsUsed, ATTEMPT_FORMS)} из ` +
    'разрешённых на этот экзамен. Попросите учителя открыть ещё одну попытку.'
  );
}
