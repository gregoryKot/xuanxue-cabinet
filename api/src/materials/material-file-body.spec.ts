// Чистая логика без Mongo и без DI (CLAUDE.md «Тесты», уровень «чистая
// логика») — образец стиля: exam-images/exam-image-body.spec.ts (второй
// потребитель той же механики, common/raw-body-route.ts).
import { isMaterialFileUpload } from './material-file-body';

const MATERIAL_ID = '507f1f77bcf86cd799439011';
const UPLOAD_PATH = `/api/materials/${MATERIAL_ID}/file`;

function req(overrides: {
  method?: string;
  url?: string;
  contentType?: string | string[];
}): Parameters<typeof isMaterialFileUpload>[0] {
  return {
    method: overrides.method ?? 'POST',
    url: overrides.url ?? UPLOAD_PATH,
    headers: { 'content-type': overrides.contentType ?? 'application/pdf' },
  };
}

describe('isMaterialFileUpload', () => {
  it('POST на /api/materials/<id>/file с application/pdf — true', () => {
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
    expect(isMaterialFileUpload({ method: 'POST', url: UPLOAD_PATH, headers: {} })).toBe(
      false,
    );
  });
});
