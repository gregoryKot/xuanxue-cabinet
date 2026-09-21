// Чистая логика без Mongo и без DI (CLAUDE.md «Тесты», уровень «чистая
// логика») — образец стиля: exam-images/exam-image-body.spec.ts (второй
// потребитель той же механики, common/raw-body-route.ts). Сессия — та же
// проверка, что и у соседа: common/raw-body-session.spec.ts покрывает её
// ветки по отдельности (нет cookie/чужая подпись/протухший/валидный), здесь —
// только что предикат её действительно зовёт последним условием.
import { DateTime } from 'luxon';
import { SESSION_COOKIE } from '../auth/session-cookie';
import { SESSION_MAX_AGE_DAYS, signSession } from '../auth/session-token';
import { makeIsMaterialFileUpload } from './material-file-body';

const MATERIAL_ID = '507f1f77bcf86cd799439011';
const UPLOAD_PATH = `/api/materials/${MATERIAL_ID}/file`;
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
}): Parameters<ReturnType<typeof makeIsMaterialFileUpload>>[0] {
  return {
    method: overrides.method ?? 'POST',
    url: overrides.url ?? UPLOAD_PATH,
    headers: {
      'content-type': overrides.contentType ?? 'application/pdf',
      cookie: overrides.cookie ?? validCookie(),
    },
  };
}

describe('makeIsMaterialFileUpload', () => {
  const isMaterialFileUpload = makeIsMaterialFileUpload(SECRET);

  it('POST на /api/materials/<id>/file с application/pdf и валидной сессией — true', () => {
    expect(isMaterialFileUpload(req({}))).toBe(true);
  });

  it.each(['image/png', 'image/jpeg', 'image/webp'])('%s — true', (contentType) => {
    expect(isMaterialFileUpload(req({ contentType }))).toBe(true);
  });

  it.each(['application/json', 'text/html'])('%s — false', (contentType) => {
    expect(isMaterialFileUpload(req({ contentType }))).toBe(false);
  });

  it('метод GET — false', () => {
    expect(isMaterialFileUpload(req({ method: 'GET' }))).toBe(false);
  });

  it('метод DELETE — false', () => {
    expect(isMaterialFileUpload(req({ method: 'DELETE' }))).toBe(false);
  });

  it('путь с невалидным id (не 24 hex) — false', () => {
    expect(isMaterialFileUpload(req({ url: '/api/materials/abc/file' }))).toBe(false);
  });

  it('чужой путь — false', () => {
    expect(isMaterialFileUpload(req({ url: '/api/exam-images' }))).toBe(false);
  });

  it('путь с query-строкой — true (query отброшена)', () => {
    expect(isMaterialFileUpload(req({ url: `${UPLOAD_PATH}?x=1` }))).toBe(true);
  });

  it('путь с завершающим слешем — true (слеш отброшен)', () => {
    expect(isMaterialFileUpload(req({ url: `${UPLOAD_PATH}/` }))).toBe(true);
  });

  it('application/pdf; charset=utf-8 — true (media type до «;»)', () => {
    expect(
      isMaterialFileUpload(req({ contentType: 'application/pdf; charset=utf-8' })),
    ).toBe(true);
  });

  it('APPLICATION/PDF — true (без учёта регистра)', () => {
    expect(isMaterialFileUpload(req({ contentType: 'APPLICATION/PDF' }))).toBe(true);
  });

  it('заголовок content-type отсутствует — false', () => {
    expect(
      isMaterialFileUpload({
        method: 'POST',
        url: UPLOAD_PATH,
        headers: { cookie: validCookie() },
      }),
    ).toBe(false);
  });

  // Мера 1 (SECURITY §4, ADR-0083) — метод/путь/тип уже валидны, отказать
  // должна именно проверка сессии: эти случаи проверяют только её.
  describe('сессия (SECURITY §4, ADR-0083)', () => {
    it('нет заголовка Cookie — false', () => {
      expect(
        isMaterialFileUpload({
          method: 'POST',
          url: UPLOAD_PATH,
          headers: { 'content-type': 'application/pdf' },
        }),
      ).toBe(false);
    });

    it('токен подписан чужим секретом — false', () => {
      expect(isMaterialFileUpload(req({ cookie: validCookie('b'.repeat(32)) }))).toBe(
        false,
      );
    });

    it('протухший токен — false', () => {
      const token = signSession(
        {
          userId: 'u1',
          issuedAt: DateTime.utc().minus({ days: SESSION_MAX_AGE_DAYS, seconds: 1 }),
        },
        SECRET,
      );
      expect(isMaterialFileUpload(req({ cookie: `${SESSION_COOKIE}=${token}` }))).toBe(
        false,
      );
    });

    it('валидный токен — true', () => {
      expect(isMaterialFileUpload(req({ cookie: validCookie() }))).toBe(true);
    });
  });
});
