// Чистая логика без Mongo/DI/HTTP (CLAUDE.md «Тесты») — тот же образец, что
// exam-video-body.spec.ts.
import { DateTime } from 'luxon';
import { SESSION_COOKIE } from '../auth/session-cookie';
import { signSession } from '../auth/session-token';
import { makeIsAnswerVideoPart } from './answer-video-part-body';

const SECRET = 'a'.repeat(32);
const VALID_PATH = '/api/answer-videos/507f1f77bcf86cd799439011/parts/1';

function validCookie(secret = SECRET): string {
  const token = signSession({ userId: 'u1', issuedAt: DateTime.utc() }, secret);
  return `${SESSION_COOKIE}=${token}`;
}

function req(overrides: {
  method?: string;
  url?: string;
  contentType?: string | string[];
  cookie?: string;
}): Parameters<ReturnType<typeof makeIsAnswerVideoPart>>[0] {
  return {
    method: overrides.method ?? 'PUT',
    url: overrides.url ?? VALID_PATH,
    headers: {
      'content-type': overrides.contentType ?? 'application/octet-stream',
      cookie: overrides.cookie ?? validCookie(),
    },
  };
}

describe('makeIsAnswerVideoPart', () => {
  const isAnswerVideoPart = makeIsAnswerVideoPart(SECRET);

  it('PUT на /api/answer-videos/:id/parts/:n с octet-stream и валидной сессией — true', () => {
    expect(isAnswerVideoPart(req({}))).toBe(true);
  });

  it('метод POST — false', () => {
    expect(isAnswerVideoPart(req({ method: 'POST' }))).toBe(false);
  });

  it('путь без /parts/:n — false', () => {
    expect(
      isAnswerVideoPart(
        req({ url: '/api/answer-videos/507f1f77bcf86cd799439011/complete' }),
      ),
    ).toBe(false);
  });

  it('id не hex24 — false', () => {
    expect(isAnswerVideoPart(req({ url: '/api/answer-videos/не-id/parts/1' }))).toBe(
      false,
    );
  });

  it('номер части нечисловой — false', () => {
    expect(
      isAnswerVideoPart(
        req({ url: '/api/answer-videos/507f1f77bcf86cd799439011/parts/x' }),
      ),
    ).toBe(false);
  });

  it('application/json — false (не тот тип)', () => {
    expect(isAnswerVideoPart(req({ contentType: 'application/json' }))).toBe(false);
  });

  it('нет заголовка Cookie — false', () => {
    expect(
      isAnswerVideoPart({
        method: 'PUT',
        url: VALID_PATH,
        headers: { 'content-type': 'application/octet-stream' },
      }),
    ).toBe(false);
  });

  it('токен подписан чужим секретом — false', () => {
    expect(isAnswerVideoPart(req({ cookie: validCookie('b'.repeat(32)) }))).toBe(false);
  });
});
