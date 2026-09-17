// Чистая логика, без Mongo и без Telegram (CLAUDE.md «Тесты»): кодирование и
// разбор составного id кнопок вопроса/варианта плюс лимит Telegram 64 байта
// на callback_data целиком (действие:параметр).
import { Types } from 'mongoose';
import {
  buildOptionId,
  buildQuestionId,
  parseOptionId,
  parseQuestionId,
} from './exam-callback-ids';

const ATTEMPT_ID = new Types.ObjectId().toString();

describe('buildQuestionId / parseQuestionId', () => {
  it('строит и разбирает обратно', () => {
    const id = buildQuestionId(ATTEMPT_ID, 3);
    expect(parseQuestionId(id)).toEqual({ attemptId: ATTEMPT_ID, index: 3 });
  });

  it('index 0 разбирается, не путается с «нет числа»', () => {
    expect(parseQuestionId(buildQuestionId(ATTEMPT_ID, 0))).toEqual({
      attemptId: ATTEMPT_ID,
      index: 0,
    });
  });

  it('не ObjectId — null', () => {
    expect(parseQuestionId('не-id:1')).toBeNull();
  });

  it('нечисловой/отрицательный индекс — null', () => {
    expect(parseQuestionId(`${ATTEMPT_ID}:abc`)).toBeNull();
    expect(parseQuestionId(`${ATTEMPT_ID}:-1`)).toBeNull();
    expect(parseQuestionId(`${ATTEMPT_ID}:1.5`)).toBeNull();
  });

  it('умещается в лимит callback_data 64 байта вместе с действием', () => {
    const data = `eq:${buildQuestionId(ATTEMPT_ID, 99)}`;
    expect(Buffer.byteLength(data, 'utf8')).toBeLessThanOrEqual(64);
  });
});

describe('buildOptionId / parseOptionId', () => {
  it('строит и разбирает обратно', () => {
    const id = buildOptionId(ATTEMPT_ID, 2, 5);
    expect(parseOptionId(id)).toEqual({
      attemptId: ATTEMPT_ID,
      questionIndex: 2,
      optionIndex: 5,
    });
  });

  it('не ObjectId — null', () => {
    expect(parseOptionId('не-id:1:2')).toBeNull();
  });

  it('нечисловой/отрицательный номер варианта — null', () => {
    expect(parseOptionId(`${ATTEMPT_ID}:1:abc`)).toBeNull();
    expect(parseOptionId(`${ATTEMPT_ID}:-1:2`)).toBeNull();
    expect(parseOptionId(`${ATTEMPT_ID}:1:-2`)).toBeNull();
  });

  it('умещается в лимит callback_data 64 байта вместе с действием', () => {
    const data = `eo:${buildOptionId(ATTEMPT_ID, 9, 9)}`;
    expect(Buffer.byteLength(data, 'utf8')).toBeLessThanOrEqual(64);
  });
});
