// Чистая логика без Mongo и без DI (CLAUDE.md «Тесты», уровень «чистая
// логика»). Сигнатуры и общий порядок проверок покрыты в
// common/raw-upload.spec.ts — здесь только своя часть файла материала: PDF
// в списке распознаваемых типов, тексты сообщений, границы MATERIAL_FILE_LIMITS.
import {
  MATERIAL_FILE_EMPTY_MESSAGE,
  MATERIAL_FILE_LIMITS,
  MATERIAL_FILE_TOO_LARGE_MESSAGE,
  MATERIAL_FILE_UNSUPPORTED_MESSAGE,
} from '@xuanxue/shared';
import { InvalidInputError } from '../common/errors';
import { parseMaterialFileUpload } from './material-file-upload';

const PDF_SIGNATURE = Buffer.from('%PDF-1.7\nметодичка', 'utf8');
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]);
const GARBAGE = Buffer.from('это просто текст, не файл материала', 'utf8');

/** Буфер нужного размера с валидной сигнатурой PDF в начале — через
 * `Buffer.alloc`, не строковую конкатенацию (задание, большие буферы). */
function pdfOfSize(size: number): Buffer {
  return Buffer.concat([
    Buffer.from('%PDF-', 'ascii'),
    Buffer.alloc(size - '%PDF-'.length),
  ]);
}

describe('parseMaterialFileUpload', () => {
  it('PDF-байты — bytes и application/pdf', () => {
    expect(parseMaterialFileUpload(PDF_SIGNATURE)).toEqual({
      bytes: PDF_SIGNATURE,
      contentType: 'application/pdf',
    });
  });

  it('JPEG-байты — image/jpeg', () => {
    expect(parseMaterialFileUpload(JPEG_SIGNATURE)).toEqual({
      bytes: JPEG_SIGNATURE,
      contentType: 'image/jpeg',
    });
  });

  it.each([
    ['пустой Buffer', Buffer.alloc(0)],
    ['undefined', undefined],
    ['не Buffer (объект)', {}],
  ])('%s — MATERIAL_FILE_EMPTY_MESSAGE', (_label, body) => {
    expect(() => parseMaterialFileUpload(body)).toThrow(InvalidInputError);
    expect(() => parseMaterialFileUpload(body)).toThrow(MATERIAL_FILE_EMPTY_MESSAGE);
  });

  it('мусор в пределах лимита — MATERIAL_FILE_UNSUPPORTED_MESSAGE', () => {
    expect(() => parseMaterialFileUpload(GARBAGE)).toThrow(
      MATERIAL_FILE_UNSUPPORTED_MESSAGE,
    );
  });

  it('ровно MATERIAL_FILE_LIMITS.maxBytes с валидной сигнатурой — проходит', () => {
    const atLimit = pdfOfSize(MATERIAL_FILE_LIMITS.maxBytes);

    expect(parseMaterialFileUpload(atLimit).contentType).toBe('application/pdf');
  });

  it('maxBytes + 1 — MATERIAL_FILE_TOO_LARGE_MESSAGE', () => {
    const oversized = pdfOfSize(MATERIAL_FILE_LIMITS.maxBytes + 1);

    expect(() => parseMaterialFileUpload(oversized)).toThrow(
      MATERIAL_FILE_TOO_LARGE_MESSAGE,
    );
  });
});
