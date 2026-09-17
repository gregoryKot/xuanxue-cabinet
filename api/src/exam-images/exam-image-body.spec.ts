// Чистая логика без Mongo/DI/HTTP (CLAUDE.md «Тесты») — каждая ветка
// предиката отдельно, чтобы падение указывало ровно на причину.
import { EXAM_IMAGES_ROUTE_PATH, isExamImageUpload } from './exam-image-body';

function req(overrides: {
  method?: string;
  url?: string;
  contentType?: string | string[];
}): Parameters<typeof isExamImageUpload>[0] {
  return {
    method: overrides.method ?? 'POST',
    url: overrides.url ?? EXAM_IMAGES_ROUTE_PATH,
    headers: { 'content-type': overrides.contentType ?? 'image/jpeg' },
  };
}

describe('isExamImageUpload', () => {
  it('POST на /api/exam-images с image/jpeg — true', () => {
    expect(isExamImageUpload(req({}))).toBe(true);
  });

  it('другой путь — false', () => {
    expect(isExamImageUpload(req({ url: '/api/exam-items' }))).toBe(false);
  });

  it('вложенный путь /api/exam-images/abc — false', () => {
    expect(isExamImageUpload(req({ url: '/api/exam-images/abc' }))).toBe(false);
  });

  it('путь с query-строкой — true (query отброшена)', () => {
    expect(isExamImageUpload(req({ url: '/api/exam-images?x=1' }))).toBe(true);
  });

  it('путь с завершающим слешем — true (слеш отброшен)', () => {
    expect(isExamImageUpload(req({ url: '/api/exam-images/' }))).toBe(true);
  });

  it('метод GET — false', () => {
    expect(isExamImageUpload(req({ method: 'GET' }))).toBe(false);
  });

  it('метод в нижнем регистре (post) — true', () => {
    expect(isExamImageUpload(req({ method: 'post' }))).toBe(true);
  });

  it('image/jpeg; charset=binary — true (media type до «;»)', () => {
    expect(isExamImageUpload(req({ contentType: 'image/jpeg; charset=binary' }))).toBe(
      true,
    );
  });

  it('IMAGE/PNG — true (без учёта регистра)', () => {
    expect(isExamImageUpload(req({ contentType: 'IMAGE/PNG' }))).toBe(true);
  });

  it('application/json — false', () => {
    expect(isExamImageUpload(req({ contentType: 'application/json' }))).toBe(false);
  });

  it('заголовок content-type отсутствует — false', () => {
    expect(
      isExamImageUpload({ method: 'POST', url: EXAM_IMAGES_ROUTE_PATH, headers: {} }),
    ).toBe(false);
  });

  it('заголовок-массив — false', () => {
    expect(isExamImageUpload(req({ contentType: ['image/jpeg'] }))).toBe(false);
  });
});
