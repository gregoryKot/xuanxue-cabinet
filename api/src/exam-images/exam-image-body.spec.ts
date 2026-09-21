// Чистая логика без Mongo/DI/HTTP (CLAUDE.md «Тесты») — каждая ветка
// предиката отдельно, чтобы падение указывало ровно на причину. Сессия —
// та же проверка, что у material-file-body.ts: common/raw-body-session.spec.ts
// покрывает её ветки по отдельности, здесь — только что предикат её зовёт.
import { DateTime } from 'luxon';
import { SESSION_COOKIE } from '../auth/session-cookie';
import { SESSION_MAX_AGE_DAYS, signSession } from '../auth/session-token';
import { EXAM_IMAGES_ROUTE_PATH, makeIsRawImageUpload } from './exam-image-body';

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
}): Parameters<ReturnType<typeof makeIsRawImageUpload>>[0] {
  return {
    method: overrides.method ?? 'POST',
    url: overrides.url ?? EXAM_IMAGES_ROUTE_PATH,
    headers: {
      'content-type': overrides.contentType ?? 'image/jpeg',
      cookie: overrides.cookie ?? validCookie(),
    },
  };
}

describe('makeIsRawImageUpload', () => {
  const isRawImageUpload = makeIsRawImageUpload(SECRET);

  it('POST на /api/exam-images с image/jpeg и валидной сессией — true', () => {
    expect(isRawImageUpload(req({}))).toBe(true);
  });

  it('другой путь — false', () => {
    expect(isRawImageUpload(req({ url: '/api/exam-items' }))).toBe(false);
  });

  it('вложенный путь /api/exam-images/abc — false', () => {
    expect(isRawImageUpload(req({ url: '/api/exam-images/abc' }))).toBe(false);
  });

  it('путь с query-строкой — true (query отброшена)', () => {
    expect(isRawImageUpload(req({ url: '/api/exam-images?x=1' }))).toBe(true);
  });

  it('путь с завершающим слешем — true (слеш отброшен)', () => {
    expect(isRawImageUpload(req({ url: '/api/exam-images/' }))).toBe(true);
  });

  it('метод GET — false', () => {
    expect(isRawImageUpload(req({ method: 'GET' }))).toBe(false);
  });

  it('метод в нижнем регистре (post) — true', () => {
    expect(isRawImageUpload(req({ method: 'post' }))).toBe(true);
  });

  it('image/jpeg; charset=binary — true (media type до «;»)', () => {
    expect(isRawImageUpload(req({ contentType: 'image/jpeg; charset=binary' }))).toBe(
      true,
    );
  });

  it('IMAGE/PNG — true (без учёта регистра)', () => {
    expect(isRawImageUpload(req({ contentType: 'IMAGE/PNG' }))).toBe(true);
  });

  it('application/json — false', () => {
    expect(isRawImageUpload(req({ contentType: 'application/json' }))).toBe(false);
  });

  it('заголовок content-type отсутствует — false', () => {
    expect(
      isRawImageUpload({
        method: 'POST',
        url: EXAM_IMAGES_ROUTE_PATH,
        headers: { cookie: validCookie() },
      }),
    ).toBe(false);
  });

  it('заголовок-массив — false', () => {
    expect(isRawImageUpload(req({ contentType: ['image/jpeg'] }))).toBe(false);
  });

  // Мера 1 (SECURITY §4, ADR-0081) — метод/путь/тип уже валидны, отказать
  // должна именно проверка сессии: эти случаи проверяют только её.
  describe('сессия (SECURITY §4, ADR-0081)', () => {
    it('нет заголовка Cookie — false', () => {
      expect(
        isRawImageUpload({
          method: 'POST',
          url: EXAM_IMAGES_ROUTE_PATH,
          headers: { 'content-type': 'image/jpeg' },
        }),
      ).toBe(false);
    });

    it('токен подписан чужим секретом — false', () => {
      expect(isRawImageUpload(req({ cookie: validCookie('b'.repeat(32)) }))).toBe(false);
    });

    it('протухший токен — false', () => {
      const token = signSession(
        {
          userId: 'u1',
          issuedAt: DateTime.utc().minus({ days: SESSION_MAX_AGE_DAYS, seconds: 1 }),
        },
        SECRET,
      );
      expect(isRawImageUpload(req({ cookie: `${SESSION_COOKIE}=${token}` }))).toBe(false);
    });

    it('валидный токен — true', () => {
      expect(isRawImageUpload(req({ cookie: validCookie() }))).toBe(true);
    });
  });

  // Второй маршрут сырого тела (ADR-0050, SECURITY §4) — снимок перевода.
  describe('снимок перевода /api/me/payments/:month/screenshot', () => {
    it('POST с image/jpeg — true', () => {
      expect(isRawImageUpload(req({ url: '/api/me/payments/2026-09/screenshot' }))).toBe(
        true,
      );
    });

    it('text/plain — false', () => {
      expect(
        isRawImageUpload(
          req({ url: '/api/me/payments/2026-09/screenshot', contentType: 'text/plain' }),
        ),
      ).toBe(false);
    });

    it('метод GET — false', () => {
      expect(
        isRawImageUpload(
          req({ url: '/api/me/payments/2026-09/screenshot', method: 'GET' }),
        ),
      ).toBe(false);
    });

    it('вложенный путь .../screenshot/extra — false', () => {
      expect(
        isRawImageUpload(req({ url: '/api/me/payments/2026-09/screenshot/extra' })),
      ).toBe(false);
    });

    it('без сегмента месяца /api/me/payments/screenshot — false', () => {
      expect(isRawImageUpload(req({ url: '/api/me/payments/screenshot' }))).toBe(false);
    });

    it('без /screenshot /api/me/payments — false', () => {
      expect(isRawImageUpload(req({ url: '/api/me/payments' }))).toBe(false);
    });

    it('путь с query-строкой — true (query отброшена)', () => {
      expect(
        isRawImageUpload(req({ url: '/api/me/payments/2026-09/screenshot?x=1' })),
      ).toBe(true);
    });

    it('путь с завершающим слешем — true (слеш отброшен)', () => {
      expect(isRawImageUpload(req({ url: '/api/me/payments/2026-09/screenshot/' }))).toBe(
        true,
      );
    });
  });
});
