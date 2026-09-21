// Чистая логика, без Mongo и DI (CLAUDE.md «Тесты»).
import type { AttemptReviewDto } from '@xuanxue/shared';
import { attemptSubmittedMessage } from './attempt-submitted-message';

const EXAM_TITLE = 'Экзамен по третьей форме';
const ATTEMPT_ID = '507f1f77bcf86cd799439011';

function fakeReview(overrides: Partial<AttemptReviewDto> = {}): AttemptReviewDto {
  return {
    attemptId: ATTEMPT_ID,
    examId: '507f1f77bcf86cd799439012',
    examTitle: EXAM_TITLE,
    userId: '507f1f77bcf86cd799439013',
    userName: 'Мария',
    status: 'submitted',
    blocks: [],
    ...overrides,
  };
}

describe('attemptSubmittedMessage', () => {
  it('есть PUBLIC_URL — имя, экзамен и ссылка на карточку проверки', () => {
    const text = attemptSubmittedMessage(fakeReview(), 'https://xuanxue.su');

    expect(text).toContain('Мария');
    expect(text).toContain(`«${EXAM_TITLE}»`);
    expect(text).toContain(`https://xuanxue.su/grading/${ATTEMPT_ID}`);
  });

  it('нет PUBLIC_URL — сообщение без ссылки, не «undefined»', () => {
    const text = attemptSubmittedMessage(fakeReview(), undefined);

    expect(text).toContain('Мария');
    expect(text).toContain(`«${EXAM_TITLE}»`);
    expect(text).not.toContain('undefined');
    expect(text).not.toContain('grading');
  });

  it('не спрягает глагол по полу ученика — родовой формы в тексте нет', () => {
    const text = attemptSubmittedMessage(fakeReview({ userName: 'Пётр' }), undefined);

    expect(text).not.toMatch(/сдал|сдала/);
  });

  it('несёт ответы по вопросам — автопроверка варианта прямо в сообщении', () => {
    const review = fakeReview({
      blocks: [
        {
          id: 'b1',
          title: 'Блок',
          questions: [
            {
              itemId: 'i1',
              kind: 'single',
              prompt: 'Какая форма верная?',
              options: [{ id: 'o1', text: 'A', correct: true, selected: true }],
              answered: true,
              optionsCheck: {
                correctSelectedCount: 1,
                correctTotalCount: 1,
                incorrectSelectedCount: 0,
              },
            },
          ],
        },
      ],
    });

    const text = attemptSubmittedMessage(review, undefined);

    expect(text).toContain('Какая форма верная?');
    expect(text).toContain('Верно 1 из 1.');
  });
});
