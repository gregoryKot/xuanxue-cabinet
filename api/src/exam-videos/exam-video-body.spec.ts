// Чистая логика без Mongo/DI/HTTP (CLAUDE.md «Тесты») — тот же образец, что
// exam-image-body.spec.ts. Сессия проверяется отдельно
// (common/raw-body-session.spec.ts) — здесь только что предикат её зовёт.
import { DateTime } from 'luxon';
import { SESSION_COOKIE } from '../auth/session-cookie';
import { signSession } from '../auth/session-token';
import { EXAM_VIDEOS_ROUTE_PATH, makeIsExamVideoUpload } from './exam-video-body';

const SECRET = 'a'.repeat(32);

function validCookie(secret = SECRET): string {
  const token = signSession({ userId: 'u1', issuedAt: DateTime.utc() }, secret);
  return `${SESSION_COOKIE}=${token}`;
}

function req(overrides: {
  method?: string;
  url?: string;
  contentType?: string | string[];
  cookie?: string;
}): Parameters<ReturnType<typeof makeIsExamVideoUpload>>[0] {
  return {
    method: overrides.method ?? 'POST',
    url: overrides.url ?? EXAM_VIDEOS_ROUTE_PATH,
    headers: {
      'content-type': overrides.contentType ?? 'video/mp4',
      cookie: overrides.cookie ?? validCookie(),
    },
  };
}

describe('makeIsExamVideoUpload', () => {
  const isExamVideoUpload = makeIsExamVideoUpload(SECRET);

  it('POST на /api/exam-videos с video/mp4 и валидной сессией — true', () => {
    expect(isExamVideoUpload(req({}))).toBe(true);
  });

  it('другой путь — false', () => {
    expect(isExamVideoUpload(req({ url: '/api/exam-items' }))).toBe(false);
  });

  it('вложенный путь /api/exam-videos/abc — false', () => {
    expect(isExamVideoUpload(req({ url: '/api/exam-videos/abc' }))).toBe(false);
  });

  it('путь с query-строкой — true (query отброшена)', () => {
    expect(isExamVideoUpload(req({ url: '/api/exam-videos?x=1' }))).toBe(true);
  });

  it('метод GET — false', () => {
    expect(isExamVideoUpload(req({ method: 'GET' }))).toBe(false);
  });

  it('метод отсутствует — false, не падает', () => {
    expect(
      isExamVideoUpload({
        url: EXAM_VIDEOS_ROUTE_PATH,
        headers: { 'content-type': 'video/mp4', cookie: validCookie() },
      }),
    ).toBe(false);
  });

  it('video/quicktime — true', () => {
    expect(isExamVideoUpload(req({ contentType: 'video/quicktime' }))).toBe(true);
  });

  it('application/json — false', () => {
    expect(isExamVideoUpload(req({ contentType: 'application/json' }))).toBe(false);
  });

  it('image/jpeg — false (не тот тип файла)', () => {
    expect(isExamVideoUpload(req({ contentType: 'image/jpeg' }))).toBe(false);
  });

  it('нет заголовка Cookie — false', () => {
    expect(
      isExamVideoUpload({
        method: 'POST',
        url: EXAM_VIDEOS_ROUTE_PATH,
        headers: { 'content-type': 'video/mp4' },
      }),
    ).toBe(false);
  });

  it('токен подписан чужим секретом — false', () => {
    expect(isExamVideoUpload(req({ cookie: validCookie('b'.repeat(32)) }))).toBe(false);
  });
});
