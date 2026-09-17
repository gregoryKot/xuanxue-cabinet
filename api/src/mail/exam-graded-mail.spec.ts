// Чистая логика, без Mongo и DI (CLAUDE.md «Тесты») — образец
// exam-graded-message.spec.ts (тот же текст, другой жанр: письмо).
import { examGradedMail } from './exam-graded-mail';

const EXAM_TITLE = 'Экзамен по третьей форме';
const PUBLIC_URL = 'https://xuanxue.su';

describe('examGradedMail', () => {
  it('сдан — фраза "Экзамен сдан.", тема несёт название экзамена', () => {
    const mail = examGradedMail(EXAM_TITLE, 'passed', undefined, PUBLIC_URL);

    expect(mail.subject).toContain(EXAM_TITLE);
    expect(mail.text).toContain('Экзамен сдан.');
    expect(mail.text).toContain(`Кабинет: ${PUBLIC_URL}`);
  });

  it('не сдан — фраза "Экзамен не сдан."', () => {
    const mail = examGradedMail(EXAM_TITLE, 'failed', undefined, PUBLIC_URL);

    expect(mail.text).toContain('Экзамен не сдан.');
  });

  it('нужно доработать — фраза "Нужно доработать."', () => {
    const mail = examGradedMail(EXAM_TITLE, 'needs_work', undefined, PUBLIC_URL);

    expect(mail.text).toContain('Нужно доработать.');
  });

  it('комментарий учителя — попадает в текст как есть, без правок', () => {
    const mail = examGradedMail(
      EXAM_TITLE,
      'needs_work',
      'Переснимите третью связку, руки ниже плеч.',
      PUBLIC_URL,
    );

    expect(mail.text).toContain('Переснимите третью связку, руки ниже плеч.');
  });

  it('без PUBLIC_URL — без строки кабинета, не "undefined"', () => {
    const mail = examGradedMail(EXAM_TITLE, 'passed', undefined, undefined);

    expect(mail.text).not.toContain('undefined');
    expect(mail.text).not.toContain('Кабинет');
  });
});
