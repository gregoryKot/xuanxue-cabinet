// Чистая логика, без Mongo и DI (CLAUDE.md «Тесты»).
import type { ExamAttemptDto } from '@xuanxue/shared';
import { buildGradeQueueScreen } from './grade-queue-screen';

function attempt(overrides: Partial<ExamAttemptDto> = {}): ExamAttemptDto {
  return {
    id: '507f1f77bcf86cd799439011',
    examId: '507f1f77bcf86cd799439012',
    examTitle: 'Экзамен по третьей форме',
    userId: '507f1f77bcf86cd799439013',
    userName: 'Ольга',
    status: 'submitted',
    blocks: [],
    answers: [],
    startedAt: '2026-09-17T09:00:00Z',
    expired: false,
    ...overrides,
  };
}

describe('buildGradeQueueScreen', () => {
  it('пустой список — честный текст «пока нечего», без кнопок', () => {
    const screen = buildGradeQueueScreen([]);
    expect(screen.text).toContain('нечего проверять');
    expect(screen.buttons).toEqual([]);
  });

  it('строка на попытку — имя и экзамен, кнопка ведёт в gradeq:<id>', () => {
    const screen = buildGradeQueueScreen([attempt()]);
    expect(screen.text).toContain('Ольга');
    expect(screen.text).toContain('Экзамен по третьей форме');
    expect(screen.buttons).toEqual([
      [expect.objectContaining({ callback_data: 'gradeq:507f1f77bcf86cd799439011' })],
    ]);
  });

  it('нет userName (защита в глубину) — честная заглушка «Ученик»', () => {
    const screen = buildGradeQueueScreen([attempt({ userName: undefined })]);
    expect(screen.text).toContain('Ученик —');
  });

  it('длинное имя — подпись кнопки обрезается с «…»', () => {
    const longName = 'Александра-Виктория-Екатерина-Валентина-Ярославна';
    const screen = buildGradeQueueScreen([attempt({ userName: longName })]);
    const button = screen.buttons[0]?.[0];
    expect(button?.text.endsWith('…')).toBe(true);
    expect(button?.text).not.toContain(longName);
  });
});
