// Разбор сырого тела загрузки файла материала (ADR-0057). Формат
// определяется по сигнатуре байтов, а не по заголовку `Content-Type`
// (SECURITY §4, общий механизм — common/raw-upload.ts): честному заголовку
// не верим — с ним в бакет уехал бы любой файл под видом PDF, и раздали бы
// мы его под тем же заголовком.
//
// Чистая функция без Mongo и без DI (CLAUDE.md «Логика вне контроллеров»).
import {
  MATERIAL_FILE_DOCX_CONTENT_TYPE,
  MATERIAL_FILE_EMPTY_MESSAGE,
  MATERIAL_FILE_EPUB_CONTENT_TYPE,
  MATERIAL_FILE_LIMITS,
  MATERIAL_FILE_RTF_CONTENT_TYPE,
  MATERIAL_FILE_TOO_LARGE_MESSAGE,
  MATERIAL_FILE_UNSUPPORTED_MESSAGE,
  type MaterialFileContentType,
} from '@xuanxue/shared';
import {
  isDocxContainer,
  isEpubContainer,
  isPdfSignature,
  isRtfSignature,
  parseRawUpload,
  sniffImageSignature,
} from '../common/raw-upload';

export interface ParsedMaterialFile {
  bytes: Buffer;
  contentType: MaterialFileContentType;
}

/** Семь типов из MATERIAL_FILE_CONTENT_TYPES. PDF, RTF и картинки
 * распознаются по первым байтам; `.docx` и `.epub` — глубже, по
 * центральному каталогу ZIP-контейнера (ADR-0080, isDocxContainer/
 * isEpubContainer): первые байты у обоих те же, что у любого ZIP. Заявленный
 * `Content-Type` запроса решает только развилку `application/rtf`/`text/rtf`
 * (см. MATERIAL_FILE_RTF_ALT_CONTENT_TYPE) — сам тип файла всегда решают
 * байты, поэтому результат RTF здесь один, независимо от заголовка. */
function sniffMaterialFileType(bytes: Buffer): MaterialFileContentType | null {
  if (isPdfSignature(bytes)) return 'application/pdf';
  if (isRtfSignature(bytes)) return MATERIAL_FILE_RTF_CONTENT_TYPE;
  if (isDocxContainer(bytes)) return MATERIAL_FILE_DOCX_CONTENT_TYPE;
  if (isEpubContainer(bytes)) return MATERIAL_FILE_EPUB_CONTENT_TYPE;
  return sniffImageSignature(bytes);
}

export function parseMaterialFileUpload(body: unknown): ParsedMaterialFile {
  return parseRawUpload<MaterialFileContentType>(body, {
    maxBytes: MATERIAL_FILE_LIMITS.maxBytes,
    sniff: sniffMaterialFileType,
    emptyMessage: MATERIAL_FILE_EMPTY_MESSAGE,
    tooLargeMessage: MATERIAL_FILE_TOO_LARGE_MESSAGE,
    unsupportedMessage: MATERIAL_FILE_UNSUPPORTED_MESSAGE,
  });
}
