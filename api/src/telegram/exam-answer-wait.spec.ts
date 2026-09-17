// Чистая функция, без Mongo (CLAUDE.md «Тесты»): что именно апдейтит
// startExamMediaWait/startExamTextWait (bot-session.service.ts).
import { DateTime } from 'luxon';
import { Types } from 'mongoose';
import { examAnswerWaitUpdate } from './exam-answer-wait';

const NOW = DateTime.utc(2026, 9, 12, 10, 0, 0);
const ATTEMPT_ID = new Types.ObjectId().toString();

describe('examAnswerWaitUpdate', () => {
  it('examMedia без номера вопроса (deep link из кабинета) — questionIndex: null', () => {
    const update = examAnswerWaitUpdate('examMedia', ATTEMPT_ID, undefined, NOW);

    expect(update.kind).toBe('examMedia');
    expect(update.attemptId.toString()).toBe(ATTEMPT_ID);
    expect(update.questionIndex).toBeNull();
    expect(update.expiresAt).toEqual(NOW.plus({ hours: 12 }).toJSDate());
  });

  it('examMedia с номером вопроса (поток вопросов бота) — questionIndex на месте', () => {
    const update = examAnswerWaitUpdate('examMedia', ATTEMPT_ID, 2, NOW);

    expect(update.questionIndex).toBe(2);
  });

  it('examText — всегда с номером вопроса', () => {
    const update = examAnswerWaitUpdate('examText', ATTEMPT_ID, 0, NOW);

    expect(update.kind).toBe('examText');
    expect(update.questionIndex).toBe(0);
  });

  // ADR-0037: itemId — тем же приёмом, что questionIndex выше.
  it('examMedia без itemId (старый deep link без вопроса) — itemId: null', () => {
    const update = examAnswerWaitUpdate('examMedia', ATTEMPT_ID, undefined, NOW);

    expect(update.itemId).toBeNull();
  });

  it('examMedia с itemId (новый deep link или поток бота) — itemId на месте', () => {
    const itemId = new Types.ObjectId().toString();

    const update = examAnswerWaitUpdate('examMedia', ATTEMPT_ID, undefined, NOW, itemId);

    expect(update.itemId?.toString()).toBe(itemId);
  });
});
