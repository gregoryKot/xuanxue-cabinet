// Чистая логика без Mongo/DI/HTTP (CLAUDE.md «Тесты») — тот же образец, что
// exam-video-body.spec.ts.
import { DateTime } from 'luxon';
import { SESSION_COOKIE } from '../auth/session-cookie';
import { signSession } from '../auth/session-token';
import { makeIsVideoPart, VIDEO_PART_PATH_PATTERNS } from './video-upload-part-body';

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
}): Parameters<ReturnType<typeof makeIsVideoPart>>[0] {
  return {
    method: overrides.method ?? 'PUT',
    url: overrides.url ?? VALID_PATH,
    headers: {
      'content-type': overrides.contentType ?? 'application/octet-stream',
      cookie: overrides.cookie ?? validCookie(),
    },
  };
}

describe('makeIsVideoPart', () => {
  const isAnswerVideoPart = makeIsVideoPart(SECRET, VIDEO_PART_PATH_PATTERNS);

  it('PUT на /api/answer-videos/:id/parts/:n с octet-stream и валидной сессией — true', () => {
    expect(isAnswerVideoPart(req({}))).toBe(true);
  });

  // ADR-0165: тот же предикат и тот же список — путь части видео вопроса.
  it('PUT на /api/exam-videos/:id/parts/:n — true (видео вопроса)', () => {
    expect(
      isAnswerVideoPart(
        req({ url: '/api/exam-videos/507f1f77bcf86cd799439011/parts/3' }),
      ),
    ).toBe(true);
  });

  it('PUT на /api/exam-videos без /:id/parts/:n — false: прежняя сырая загрузка идёт своим предикатом', () => {
    expect(isAnswerVideoPart(req({ url: '/api/exam-videos' }))).toBe(false);
    expect(isAnswerVideoPart(req({ url: '/api/exam-videos/uploads' }))).toBe(false);
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

  // ADR-0165: новый вид видео добавляет шаблон пути, а не второй предикат.
  it('предикат берёт пути из переданного списка: чужой путь не включает парсер', () => {
    const other = makeIsVideoPart(SECRET, [
      /^\/api\/lesson-videos\/[0-9a-f]{24}\/parts\/[0-9]{1,4}$/,
    ]);

    expect(
      other(req({ url: '/api/lesson-videos/507f1f77bcf86cd799439011/parts/2' })),
    ).toBe(true);
    expect(other(req({}))).toBe(false);
  });
});
