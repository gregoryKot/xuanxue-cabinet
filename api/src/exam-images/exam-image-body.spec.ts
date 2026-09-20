// Чистая логика без Mongo/DI/HTTP (CLAUDE.md «Тесты») — каждая ветка
// предиката отдельно, чтобы падение указывало ровно на причину.
import { EXAM_IMAGES_ROUTE_PATH, isRawImageUpload } from './exam-image-body';

function req(overrides: {
  method?: string;
  url?: string;
  contentType?: string | string[];
}): Parameters<typeof isRawImageUpload>[0] {
  return {
    method: overrides.method ?? 'POST',
    url: overrides.url ?? EXAM_IMAGES_ROUTE_PATH,
    headers: { 'content-type': overrides.contentType ?? 'image/jpeg' },
  };
}

describe('isRawImageUpload', () => {
  it('POST на /api/exam-images с image/jpeg — true', () => {
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
      isRawImageUpload({ method: 'POST', url: EXAM_IMAGES_ROUTE_PATH, headers: {} }),
    ).toBe(false);
  });

  it('заголовок-массив — false', () => {
    expect(isRawImageUpload(req({ contentType: ['image/jpeg'] }))).toBe(false);
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
