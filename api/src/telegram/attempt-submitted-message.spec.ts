// Чистая логика, без Mongo и DI (CLAUDE.md «Тесты»).
import { attemptSubmittedMessage } from './attempt-submitted-message';

const EXAM_TITLE = 'Экзамен по третьей форме';
const ATTEMPT_ID = '507f1f77bcf86cd799439011';

describe('attemptSubmittedMessage', () => {
  it('есть PUBLIC_URL — имя, экзамен и ссылка на карточку проверки', () => {
    const text = attemptSubmittedMessage(
      'Мария',
      EXAM_TITLE,
      ATTEMPT_ID,
      'https://xuanxue.su',
    );

    expect(text).toContain('Мария');
    expect(text).toContain(`«${EXAM_TITLE}»`);
    expect(text).toContain(`https://xuanxue.su/grading/${ATTEMPT_ID}`);
  });

  it('нет PUBLIC_URL — сообщение без ссылки, не «undefined»', () => {
    const text = attemptSubmittedMessage('Мария', EXAM_TITLE, ATTEMPT_ID, undefined);

    expect(text).toContain('Мария');
    expect(text).toContain(`«${EXAM_TITLE}»`);
    expect(text).not.toContain('undefined');
    expect(text).not.toContain('grading');
  });

  it('не спрягает глагол по полу ученика — родовой формы в тексте нет', () => {
    const text = attemptSubmittedMessage('Пётр', EXAM_TITLE, ATTEMPT_ID, undefined);

    expect(text).not.toMatch(/сдал|сдала/);
  });
});
