// Сборка настоящего ZIP для тестов: минимальный `.docx`, `.xlsx` и просто
// архив собираются здесь одним способом — иначе писатель заголовков ZIP
// завёлся бы и в юните `raw-upload.spec.ts`, и в e2e файлов материалов
// (CLAUDE.md «Одна механика — один компонент»).
//
// Записи кладутся без сжатия (метод STORE) и с настоящим CRC32: фикстура
// обязана открываться обычным архиватором, иначе `isDocxContainer`
// проверяется не на том, что приезжает от учителя (ADR-0080).
import { crc32 } from 'node:zlib';

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_ENTRY_SIGNATURE = 0x02014b50;
const EOCD_SIGNATURE = 0x06054b50;
const LOCAL_HEADER_LENGTH = 30;
const CENTRAL_ENTRY_LENGTH = 46;
const EOCD_LENGTH = 22;
/** «2.0» — версия, начиная с которой ZIP умеет каталоги и STORE. */
const VERSION_STORED = 20;
/** Бит 11 общих флагов — имена записей в UTF-8. Без него архиватор читает
 * кириллицу в имени как CP866, и фикстура перестаёт быть тем, что открывается
 * у учителя. */
const FLAG_UTF8_NAMES = 0x0800;

export interface ZipEntry {
  name: string;
  content: string;
}

export function buildZip(entries: readonly ZipEntry[]): Buffer {
  const parts: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = Buffer.from(entry.content, 'utf8');
    const checksum = crc32(data);

    const local = Buffer.alloc(LOCAL_HEADER_LENGTH);
    local.writeUInt32LE(LOCAL_HEADER_SIGNATURE, 0);
    local.writeUInt16LE(VERSION_STORED, 4);
    local.writeUInt16LE(FLAG_UTF8_NAMES, 6);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, data);

    const central = Buffer.alloc(CENTRAL_ENTRY_LENGTH);
    central.writeUInt32LE(CENTRAL_ENTRY_SIGNATURE, 0);
    central.writeUInt16LE(VERSION_STORED, 4);
    central.writeUInt16LE(VERSION_STORED, 6);
    central.writeUInt16LE(FLAG_UTF8_NAMES, 8);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    directory.push(central, name);

    offset += LOCAL_HEADER_LENGTH + name.length + data.length;
  }

  const centralDirectory = Buffer.concat(directory);
  const eocd = Buffer.alloc(EOCD_LENGTH);
  eocd.writeUInt32LE(EOCD_SIGNATURE, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...parts, centralDirectory, eocd]);
}

const CONTENT_TYPES_ENTRY: ZipEntry = {
  name: '[Content_Types].xml',
  content: '<?xml version="1.0"?><Types/>',
};

/** Минимальный `.docx`: обе записи, по которым его узнают. */
export const DOCX_BYTES = buildZip([
  CONTENT_TYPES_ENTRY,
  { name: 'word/document.xml', content: '<?xml version="1.0"?><w:document/>' },
]);

/** `.xlsx` — тот же OOXML и тот же `[Content_Types].xml`, но книга, не
 * документ: на нём проверяется, что одной первой записи мало. */
export const XLSX_BYTES = buildZip([
  CONTENT_TYPES_ENTRY,
  { name: 'xl/workbook.xml', content: '<?xml version="1.0"?><workbook/>' },
]);

/** Обычный архив — то, что получится, если переименовать `.zip` в `.docx`. */
export const PLAIN_ZIP_BYTES = buildZip([
  { name: 'заметки.txt', content: 'просто архив' },
]);
