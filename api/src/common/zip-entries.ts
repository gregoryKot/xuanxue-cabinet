// Разбор центрального каталога ZIP: имена записей контейнера, не их
// содержимое (то было бы распаковкой). Вынесено из raw-upload.ts отдельным
// файлом ради гейта check-file-size-ratchet.mjs — используется только там,
// для isDocxContainer (ADR-0080).
//
// Длины и смещения — из спецификации формата: End Of Central Directory (EOCD)
// и запись центрального каталога, не «магия».
const EOCD_SIGNATURE = 0x06054b50;
const EOCD_LENGTH = 22;
/** Комментарий ZIP переменной длины стоит после EOCD, поэтому окно поиска
 * сигнатуры с конца буфера ограничено её максимумом. */
const EOCD_COMMENT_MAX_LENGTH = 0xffff;
const CENTRAL_ENTRY_SIGNATURE = 0x02014b50;
const CENTRAL_ENTRY_LENGTH = 46;
const CENTRAL_ENTRY_NAME_LENGTH_OFFSET = 28;
const CENTRAL_ENTRY_EXTRA_LENGTH_OFFSET = 30;
const CENTRAL_ENTRY_COMMENT_LENGTH_OFFSET = 32;

/** Ищет EOCD с конца буфера в пределах допустимого окна. Возвращает -1, если
 * буфер короче EOCD или сигнатура не найдена — не бросает на мусоре. */
function findEocdOffset(bytes: Buffer): number {
  if (bytes.length < EOCD_LENGTH) return -1;
  const windowSize = Math.min(bytes.length, EOCD_LENGTH + EOCD_COMMENT_MAX_LENGTH);
  const searchStart = bytes.length - windowSize;
  for (let offset = bytes.length - EOCD_LENGTH; offset >= searchStart; offset -= 1) {
    if (bytes.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  return -1;
}

/** Имена записей центрального каталога ZIP, БЕЗ распаковки содержимого:
 * в каталоге они лежат в открытом виде, поэтому это разбор настоящей
 * структуры архива, а не доверие какому-либо заголовку. Каждое чтение — не
 * раньше проверки границ и буфера, и конца каталога: буфер пришёл из сети,
 * а «число записей» и смещения в EOCD — данные из него же, доверять им без
 * проверки нельзя (иначе битый или злонамеренный ZIP уводит за буфер).
 * Никогда не бросает: на любом не-ZIP или обрезанном буфере — пустой список. */
export function readZipEntryNames(bytes: Buffer): string[] {
  const eocdOffset = findEocdOffset(bytes);
  if (eocdOffset === -1) return [];

  const entryCount = bytes.readUInt16LE(eocdOffset + 10);
  const cdSize = bytes.readUInt32LE(eocdOffset + 12);
  const cdOffset = bytes.readUInt32LE(eocdOffset + 16);
  const names: string[] = [];
  if (cdOffset + cdSize > bytes.length) return names;

  const cdEnd = cdOffset + cdSize;
  let pos = cdOffset;
  for (let i = 0; i < entryCount && pos + CENTRAL_ENTRY_LENGTH <= cdEnd; i += 1) {
    if (bytes.readUInt32LE(pos) !== CENTRAL_ENTRY_SIGNATURE) return names;
    const nameLength = bytes.readUInt16LE(pos + CENTRAL_ENTRY_NAME_LENGTH_OFFSET);
    const extraLength = bytes.readUInt16LE(pos + CENTRAL_ENTRY_EXTRA_LENGTH_OFFSET);
    const commentLength = bytes.readUInt16LE(pos + CENTRAL_ENTRY_COMMENT_LENGTH_OFFSET);
    const nameStart = pos + CENTRAL_ENTRY_LENGTH;
    const nameEnd = nameStart + nameLength;
    // Достаточно границы каталога: выше уже доказано, что он сам лежит
    // внутри буфера, поэтому второй проверки (`nameEnd > bytes.length`) не
    // нужно — она была бы веткой, в которую не попасть.
    if (nameEnd > cdEnd) return names;

    names.push(bytes.subarray(nameStart, nameEnd).toString('utf8'));
    pos = nameEnd + extraLength + commentLength;
  }
  return names;
}
