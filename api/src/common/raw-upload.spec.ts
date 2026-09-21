// Чистая логика без Mongo и без DI (CLAUDE.md «Тесты», уровень «чистая
// логика»). Сигнатуры переехали сюда из exam-image-upload.ts, когда та же
// механика понадобилась файлам материалов (ADR-0057).
import { InvalidInputError } from './errors';
import { isPdfSignature, parseRawUpload, sniffImageSignature } from './raw-upload';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from('WEBP', 'ascii'),
]);
const PDF = Buffer.from('%PDF-1.7\nметодичка', 'utf8');
const GARBAGE = Buffer.from('это просто текст, не картинка', 'utf8');

describe('sniffImageSignature', () => {
  it.each([
    ['JPEG', JPEG, 'image/jpeg'],
    ['PNG', PNG, 'image/png'],
    ['WebP', WEBP, 'image/webp'],
  ] as const)('сигнатура %s → свой тип', (_label, bytes, expected) => {
    expect(sniffImageSignature(bytes)).toBe(expected);
  });

  it('мусор — null', () => {
    expect(sniffImageSignature(GARBAGE)).toBeNull();
  });

  it('PDF картинкой не считается', () => {
    expect(sniffImageSignature(PDF)).toBeNull();
  });

  it('обрезанная сигнатура (короче эталона) — null, не падает', () => {
    expect(sniffImageSignature(Buffer.from([0xff, 0xd8]))).toBeNull();
  });
});

describe('isPdfSignature', () => {
  it('распознаёт %PDF- в начале', () => {
    expect(isPdfSignature(PDF)).toBe(true);
  });

  it('не верит слову PDF дальше по файлу', () => {
    expect(isPdfSignature(Buffer.from('см. вложенный %PDF-1.7', 'utf8'))).toBe(false);
  });

  it('пустой буфер — false, не падает', () => {
    expect(isPdfSignature(Buffer.alloc(0))).toBe(false);
  });
});

describe('parseRawUpload', () => {
  const rules = {
    maxBytes: 16,
    sniff: sniffImageSignature,
    emptyMessage: 'пусто',
    tooLargeMessage: 'велико',
    unsupportedMessage: 'не тот формат',
  };

  it('валидное тело — bytes и распознанный тип', () => {
    expect(parseRawUpload(JPEG, rules)).toEqual({
      bytes: JPEG,
      contentType: 'image/jpeg',
    });
  });

  it.each([
    ['пустой Buffer', Buffer.alloc(0)],
    ['undefined', undefined],
    ['не Buffer (объект)', {}],
  ])('%s — сообщение про пустоту', (_label, body) => {
    expect(() => parseRawUpload(body, rules)).toThrow(InvalidInputError);
    expect(() => parseRawUpload(body, rules)).toThrow('пусто');
  });

  // Порядок проверок: перебор лимита сообщается раньше, чем «не тот формат», —
  // иначе большой файл верного вида получал бы чужой совет.
  it('мусор больше лимита — сообщение про размер, не про формат', () => {
    const big = Buffer.alloc(rules.maxBytes + 1);
    expect(() => parseRawUpload(big, rules)).toThrow('велико');
  });

  it('мусор в пределах лимита — сообщение про формат', () => {
    expect(() => parseRawUpload(GARBAGE.subarray(0, 10), rules)).toThrow('не тот формат');
  });

  it('длина ровно maxBytes — проходит', () => {
    const atLimit = Buffer.concat([JPEG, Buffer.alloc(rules.maxBytes - JPEG.length)]);
    expect(parseRawUpload(atLimit, rules).contentType).toBe('image/jpeg');
  });
});
