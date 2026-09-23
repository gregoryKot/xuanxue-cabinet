// Правило «что предложить ученику дальше» — одно на кабинет и на бота
// (getMyExamAction, ADR-0091, решение владельца 2026-09-21). Чистая логика
// без DOM и без сети, тест на каждую из шести веток по порядку из функции.
import { describe, expect, it } from 'vitest';
import type { AttemptBlockDto, ExamAttemptDto } from './exam-attempts';
import type { ExamMediaDto } from './exam-media';
import {
  firstUnansweredQuestionIndex,
  getMyExamAction,
  myExamAttemptsLeft,
  type MyExamDto,
} from './my-exams';

function makeExam(overrides: Partial<MyExamDto> = {}): MyExamDto {
  return {
    id: 'e1',
    title: 'Форма',
    description: '',
    level: '',
    attemptsAllowed: 1,
    attemptsUsed: 0,
    ...overrides,
  };
}

describe('myExamAttemptsLeft', () => {
  it('разница попыток', () => {
    expect(myExamAttemptsLeft(makeExam({ attemptsAllowed: 3, attemptsUsed: 1 }))).toBe(2);
  });

  it('не уходит в минус, когда учитель уменьшил лимит формы', () => {
    expect(myExamAttemptsLeft(makeExam({ attemptsAllowed: 1, attemptsUsed: 2 }))).toBe(0);
  });
});

describe('getMyExamAction', () => {
  it('1. попытка в работе — «continue», даже если лимит уже исчерпан', () => {
    const exam = makeExam({
      attemptsAllowed: 1,
      attemptsUsed: 1,
      lastAttempt: { id: 'a1', status: 'in_progress', expired: false },
    });
    expect(getMyExamAction(exam)).toBe('continue');
  });

  it('2. лимит попыток исчерпан — null, даже если последнюю закрыло время', () => {
    const exam = makeExam({
      attemptsAllowed: 1,
      attemptsUsed: 1,
      lastAttempt: { id: 'a1', status: 'submitted', expired: true },
    });
    expect(getMyExamAction(exam)).toBeNull();
  });

  it('2а. лимит исчерпан и попытки не было вовсе (attemptsAllowed: 0) — null', () => {
    expect(getMyExamAction(makeExam({ attemptsAllowed: 0, attemptsUsed: 0 }))).toBeNull();
  });

  it('3. попыток не начинали, лимит не исчерпан — «start»', () => {
    expect(getMyExamAction(makeExam({ attemptsAllowed: 1, attemptsUsed: 0 }))).toBe(
      'start',
    );
  });

  it('4. работу проверили — «retry» независимо от того, что было с дедлайном', () => {
    const exam = makeExam({
      attemptsAllowed: 2,
      attemptsUsed: 1,
      lastAttempt: {
        id: 'a1',
        status: 'graded',
        outcome: 'needs_work',
        expired: false,
      },
    });
    expect(getMyExamAction(exam)).toBe('retry');
  });

  it('5. сдано, но попытку закрыло время — «retry»: человек не успел, не обошёл проверку', () => {
    const exam = makeExam({
      attemptsAllowed: 2,
      attemptsUsed: 1,
      lastAttempt: { id: 'a1', status: 'submitted', expired: true },
    });
    expect(getMyExamAction(exam)).toBe('retry');
  });

  it('6. сдал сам и ждёт проверки — null: вторая попытка была бы обходом проверки', () => {
    const exam = makeExam({
      attemptsAllowed: 2,
      attemptsUsed: 1,
      lastAttempt: { id: 'a1', status: 'submitted', expired: false },
    });
    expect(getMyExamAction(exam)).toBeNull();
  });
});

// Куда боту открывать «Продолжить» (отзыв владельца 2026-09-22, ADR-0119):
// бот показывает по вопросу на экран, кабинету эта функция не нужна (вся
// форма на одной странице).
describe('firstUnansweredQuestionIndex', () => {
  function block(questions: AttemptBlockDto['questions']): AttemptBlockDto {
    return { id: 'b1', title: '', questions };
  }

  function attempt(
    overrides: Pick<ExamAttemptDto, 'blocks' | 'answers'> & { media?: ExamMediaDto[] },
  ): Pick<ExamAttemptDto, 'blocks' | 'answers' | 'media'> {
    return overrides;
  }

  it('первый вопрос без ответа — не первый в списке', () => {
    const a = attempt({
      blocks: [
        block([
          { itemId: 'i1', version: 1, kind: 'single', prompt: 'В1', options: [] },
          { itemId: 'i2', version: 1, kind: 'single', prompt: 'В2', options: [] },
          { itemId: 'i3', version: 1, kind: 'single', prompt: 'В3', options: [] },
        ]),
      ],
      answers: [{ itemId: 'i1', optionIds: ['o1'] }],
    });
    expect(firstUnansweredQuestionIndex(a)).toBe(1);
  });

  it('текстовый ответ из одних пробелов — не отвечено (то же правило, что exam-attempt-review.ts)', () => {
    const a = attempt({
      blocks: [
        block([{ itemId: 'i1', version: 1, kind: 'text', prompt: 'В1', options: [] }]),
      ],
      answers: [{ itemId: 'i1', text: '   ' }],
    });
    expect(firstUnansweredQuestionIndex(a)).toBe(0);
  });

  it('видео-вопрос отвечает записью в media, не строкой в answers (ADR-0037)', () => {
    const media: ExamMediaDto = {
      id: 'm1',
      attemptId: 'a1',
      itemId: 'i1',
      kind: 'telegram',
      receivedAt: '2026-09-22T10:00:00Z',
    };
    const a = attempt({
      blocks: [
        block([
          { itemId: 'i1', version: 1, kind: 'video', prompt: 'В1', options: [] },
          { itemId: 'i2', version: 1, kind: 'single', prompt: 'В2', options: [] },
        ]),
      ],
      answers: [],
      media: [media],
    });
    expect(firstUnansweredQuestionIndex(a)).toBe(1);
  });

  it('все отвечены — последний вопрос, не первый', () => {
    const a = attempt({
      blocks: [
        block([
          { itemId: 'i1', version: 1, kind: 'single', prompt: 'В1', options: [] },
          { itemId: 'i2', version: 1, kind: 'single', prompt: 'В2', options: [] },
        ]),
      ],
      answers: [
        { itemId: 'i1', optionIds: ['o1'] },
        { itemId: 'i2', optionIds: ['o1'] },
      ],
    });
    expect(firstUnansweredQuestionIndex(a)).toBe(1);
  });

  it('пустой снимок — 0, не падает', () => {
    expect(firstUnansweredQuestionIndex(attempt({ blocks: [], answers: [] }))).toBe(0);
  });
});
