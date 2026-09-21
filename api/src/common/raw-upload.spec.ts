// Чистая логика без Mongo и без DI (CLAUDE.md «Тесты», уровень «чистая
// логика»). Сигнатуры переехали сюда из exam-image-upload.ts, когда та же
// механика понадобилась файлам материалов (ADR-0057).
import { InvalidInputError } from './errors';
import {
  isDocxContainer,
  isPdfSignature,
  parseRawUpload,
  sniffImageSignature,
} from './raw-upload';
import { DOCX_BYTES, PLAIN_ZIP_BYTES, XLSX_BYTES } from './zip-fixture.test-support';

/** EOCD без комментария — фиксированные последние 22 байта ZIP (см.
 * zip-entries.ts): по этому смещению тест портит каталог у настоящего
 * `.docx`, не выдумывая свой ZIP с нуля. */
const EOCD_LENGTH_WITHOUT_COMMENT = 22;
/** Смещение поля «offset центрального каталога» внутри EOCD. */
const EOCD_CD_OFFSET_FIELD_OFFSET = 16;
/** Смещение поля «длина имени» внутри записи центрального каталога. */
const CENTRAL_ENTRY_NAME_LENGTH_OFFSET = 28;

/** Копия настоящего `.docx` и смещение его центрального каталога — три теста
 * ниже портят каталог по-разному, и каждый начинается с рабочего архива. */
function tamperedDocx(): { bytes: Buffer; cdOffset: number } {
  const bytes = Buffer.from(DOCX_BYTES);
  const eocdOffset = bytes.length - EOCD_LENGTH_WITHOUT_COMMENT;
  return {
    bytes,
    cdOffset: bytes.readUInt32LE(eocdOffset + EOCD_CD_OFFSET_FIELD_OFFSET),
  };
}

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

describe('isDocxContainer', () => {
  it('настоящий .docx с обеими обязательными записями — true', () => {
    expect(isDocxContainer(DOCX_BYTES)).toBe(true);
  });

  it('обычный архив без word/document.xml — false', () => {
    expect(isDocxContainer(PLAIN_ZIP_BYTES)).toBe(false);
  });

  it('.xlsx с тем же [Content_Types].xml, но без документа Word — false', () => {
    expect(isDocxContainer(XLSX_BYTES)).toBe(false);
  });

  it('обрезанный .docx (EOCD срезан) — false, не исключение', () => {
    const truncated = DOCX_BYTES.subarray(0, DOCX_BYTES.length - 10);
    expect(() => isDocxContainer(truncated)).not.toThrow();
    expect(isDocxContainer(truncated)).toBe(false);
  });

  it('мусорный буфер — false, не исключение', () => {
    expect(() => isDocxContainer(GARBAGE)).not.toThrow();
    expect(isDocxContainer(GARBAGE)).toBe(false);
  });

  it('пустой буфер — false, не исключение', () => {
    expect(isDocxContainer(Buffer.alloc(0))).toBe(false);
  });

  it('начинается с сигнатуры ZIP, но каталога и EOCD нет — false', () => {
    const zipLocalHeaderOnly = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.alloc(30),
    ]);
    expect(isDocxContainer(zipLocalHeaderOnly)).toBe(false);
  });

  // Злонамеренный случай: EOCD на месте (значит, isDocxContainer вообще
  // читает каталог), но смещение центрального каталога указывает за
  // пределы буфера — ровно то, ради чего проверяются границы перед чтением.
  it('EOCD на месте, но offset центрального каталога уводит за буфер — false', () => {
    const tampered = Buffer.from(DOCX_BYTES);
    const eocdOffset = tampered.length - EOCD_LENGTH_WITHOUT_COMMENT;
    tampered.writeUInt32LE(0xffffffff, eocdOffset + EOCD_CD_OFFSET_FIELD_OFFSET);

    expect(() => isDocxContainer(tampered)).not.toThrow();
    expect(isDocxContainer(tampered)).toBe(false);
  });

  it('EOCD ведёт на каталог, а записи там нет — false', () => {
    const { bytes, cdOffset } = tamperedDocx();
    bytes.writeUInt32LE(0, cdOffset);

    expect(() => isDocxContainer(bytes)).not.toThrow();
    expect(isDocxContainer(bytes)).toBe(false);
  });

  it('длина имени записи уводит за конец каталога — false', () => {
    const { bytes, cdOffset } = tamperedDocx();
    bytes.writeUInt16LE(0xffff, cdOffset + CENTRAL_ENTRY_NAME_LENGTH_OFFSET);

    expect(() => isDocxContainer(bytes)).not.toThrow();
    expect(isDocxContainer(bytes)).toBe(false);
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
