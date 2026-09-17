// Чистая логика, без Mongo и DI (CLAUDE.md «Тесты»).
import { examGradedMessage } from './exam-graded-message';

const EXAM_TITLE = 'Экзамен по третьей форме';
const PUBLIC_URL = 'https://xuanxue.su';

describe('examGradedMessage', () => {
  it('зачёт — исход по-русски, ссылка на кабинет', () => {
    const text = examGradedMessage(EXAM_TITLE, 'passed', undefined, PUBLIC_URL);

    expect(text).toContain(`«${EXAM_TITLE}»`);
    expect(text).toContain('Экзамен сдан.');
    expect(text).toContain(PUBLIC_URL);
  });

  it('незачёт — исход по-русски', () => {
    const text = examGradedMessage(EXAM_TITLE, 'failed', undefined, PUBLIC_URL);

    expect(text).toContain('Экзамен не сдан.');
  });

  it('доработать — исход по-русски, теми же словами, что в кабинете', () => {
    const text = examGradedMessage(EXAM_TITLE, 'needs_work', undefined, PUBLIC_URL);

    expect(text).toContain('Нужно доработать.');
  });

  it('есть комментарий учителя — входит в текст как есть', () => {
    const text = examGradedMessage(
      EXAM_TITLE,
      'needs_work',
      'Проверьте устойчивость в третьей стойке.',
      PUBLIC_URL,
    );

    expect(text).toContain('Проверьте устойчивость в третьей стойке.');
  });

  it('нет комментария учителя — сообщение без него, не «undefined»', () => {
    const text = examGradedMessage(EXAM_TITLE, 'passed', undefined, PUBLIC_URL);

    expect(text).not.toContain('undefined');
  });

  it('нет PUBLIC_URL — сообщение без ссылки, не «undefined»', () => {
    const text = examGradedMessage(EXAM_TITLE, 'passed', undefined, undefined);

    expect(text).not.toContain('undefined');
  });

  it('без баллов и критериев — итог качественный (PLAN §11 «Границы»)', () => {
    const text = examGradedMessage(EXAM_TITLE, 'passed', undefined, PUBLIC_URL);

    expect(text).not.toMatch(/балл|критери/i);
  });
});
