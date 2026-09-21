// Юнит на чистый разбор — без Mongo и без DI (CLAUDE.md «Тесты»): четыре вида
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

  // ADR-0037: вторая форма адресует видео вопросу; старая без вопроса
  // продолжает работать — такие ссылки могли уже уйти ученикам.
  describe('exam_<attemptId>_<itemId> (ADR-0037)', () => {
    it('оба валидных ObjectId — examMedia с itemId', () => {
      const attemptId = new Types.ObjectId().toString();
      const itemId = new Types.ObjectId().toString();
      expect(parseStartPayload(fakeCtx(`/start exam_${attemptId}_${itemId}`))).toEqual({
        kind: 'examMedia',
        attemptId,
        itemId,
      });
    });

    it('itemId не ObjectId — null (не откатывается к старой форме без вопроса)', () => {
      const attemptId = new Types.ObjectId().toString();
      expect(parseStartPayload(fakeCtx(`/start exam_${attemptId}_not-an-id`))).toBeNull();
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

  describe('pay_<YYYY-MM>', () => {
    it('валидный месяц — paymentScreenshot', () => {
      expect(parseStartPayload(fakeCtx('/start pay_2026-09'))).toEqual({
        kind: 'paymentScreenshot',
        month: '2026-09',
      });
    });

    it('битый месяц (без ведущего нуля) — null', () => {
      expect(parseStartPayload(fakeCtx('/start pay_2026-9'))).toBeNull();
    });

    it('месяц вне 01–12 — null', () => {
      expect(parseStartPayload(fakeCtx('/start pay_2026-13'))).toBeNull();
    });

    it('сокращённый год — null', () => {
      expect(parseStartPayload(fakeCtx('/start pay_26-09'))).toBeNull();
    });
  });

  it('чужая команда без известного префикса — null', () => {
    expect(parseStartPayload(fakeCtx('/start что-то-своё'))).toBeNull();
  });
});
