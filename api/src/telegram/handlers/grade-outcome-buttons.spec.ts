// Чистая логика, без Mongo и DI (CLAUDE.md «Тесты»).
import { buildGradeButtonId } from './grade-callback-id';
import {
  buildGradeOutcomeButtons,
  buildSkipCancelButtons,
} from './grade-outcome-buttons';

const ATTEMPT_ID = '507f1f77bcf86cd799439011';

describe('buildGradeOutcomeButtons', () => {
  it('порядок «Зачёт», «Доработать», «Незачёт» — как в ТЗ', () => {
    const [row] = buildGradeOutcomeButtons(ATTEMPT_ID);
    expect(row?.map((b) => b.text)).toEqual(['Зачёт', 'Доработать', 'Незачёт']);
  });

  it('callback_data — действие grade с составным id', () => {
    const [row] = buildGradeOutcomeButtons(ATTEMPT_ID);
    expect(row?.[0]).toMatchObject({
      callback_data: `grade:${buildGradeButtonId(ATTEMPT_ID, 'passed')}`,
    });
  });
});

describe('buildSkipCancelButtons', () => {
  it('«Без комментария» и «Отмена» — id всегда attemptId', () => {
    const [row] = buildSkipCancelButtons(ATTEMPT_ID);
    expect(row).toEqual([
      { text: 'Без комментария', callback_data: `gradesk:${ATTEMPT_ID}` },
      { text: 'Отмена', callback_data: `gradecl:${ATTEMPT_ID}` },
    ]);
  });
});
