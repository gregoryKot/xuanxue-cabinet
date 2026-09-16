// Юнит на чистый разбор — без Mongo и без DI (CLAUDE.md «Тесты»): три вида
// deep link не пересекаются, битый и чужой payload дают null.
import { Types } from 'mongoose';
import type { Context } from 'telegraf';
import { parseStartPayload } from './start-payload';

function fakeCtx(text: string): Context {
  return { message: { text } } as unknown as Context;
}

describe('parseStartPayload', () => {
  it('обычный /start без payload — null', () => {
    expect(parseStartPayload(fakeCtx('/start'))).toBeNull();
  });

  it('апдейт без текстового сообщения (например, стикер) — null', () => {
    expect(
      parseStartPayload({ message: { sticker: {} } } as unknown as Context),
    ).toBeNull();
  });

  describe('exam_<attemptId>', () => {
    it('валидный ObjectId — examMedia', () => {
      const attemptId = new Types.ObjectId().toString();
      expect(parseStartPayload(fakeCtx(`/start exam_${attemptId}`))).toEqual({
        kind: 'examMedia',
        attemptId,
      });
    });

    it('не ObjectId (мусор после exam_) — null', () => {
      expect(parseStartPayload(fakeCtx('/start exam_not-an-id'))).toBeNull();
    });
  });

  describe('join_<code>', () => {
    const code = 'a'.repeat(32);

    it('32 hex-символа — invite', () => {
      expect(parseStartPayload(fakeCtx(`/start join_${code}`))).toEqual({
        kind: 'invite',
        code,
      });
    });

    it('короткий код — null', () => {
      expect(parseStartPayload(fakeCtx('/start join_abc'))).toBeNull();
    });
  });

  describe('link_<code>', () => {
    const code = 'b'.repeat(32);

    it('32 hex-символа — telegramLink', () => {
      expect(parseStartPayload(fakeCtx(`/start link_${code}`))).toEqual({
        kind: 'telegramLink',
        code,
      });
    });

    it('код не hex — null', () => {
      expect(parseStartPayload(fakeCtx(`/start link_${'z'.repeat(32)}`))).toBeNull();
    });

    it('короче 32 символов — null', () => {
      expect(parseStartPayload(fakeCtx('/start link_' + 'b'.repeat(31)))).toBeNull();
    });
  });

  it('чужая команда без известного префикса — null', () => {
    expect(parseStartPayload(fakeCtx('/start что-то-своё'))).toBeNull();
  });
});
