// Чистая логика, без Mongo и DI (CLAUDE.md «Тесты») — образец
// attempt-submitted-message.spec.ts (тот же текст, другой жанр: письмо).
import { attemptSubmittedMail } from './attempt-submitted-mail';

const EXAM_TITLE = 'Экзамен по третьей форме';
const ATTEMPT_ID = '507f1f77bcf86cd799439011';
const PUBLIC_URL = 'https://xuanxue.su';

describe('attemptSubmittedMail', () => {
  it('несёт имя ученика, название экзамена и ссылку на карточку проверки', () => {
    const mail = attemptSubmittedMail('Ольга', EXAM_TITLE, ATTEMPT_ID, PUBLIC_URL);

    expect(mail.subject).toContain(EXAM_TITLE);
    expect(mail.text).toContain('Ольга');
    expect(mail.text).toContain(EXAM_TITLE);
    expect(mail.text).toContain(`${PUBLIC_URL}/grading/${ATTEMPT_ID}`);
  });

  it('без PUBLIC_URL — письмо без ссылки, не "undefined" в тексте', () => {
    const mail = attemptSubmittedMail('Ольга', EXAM_TITLE, ATTEMPT_ID, undefined);

    expect(mail.text).not.toContain('undefined');
    expect(mail.text).not.toContain('grading');
  });
});
