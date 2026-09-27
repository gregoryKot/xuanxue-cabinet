// Проверка и отправка файла материала (ADR-0057/ADR-0134, слой 3.10) —
// вынесены из useMaterialFileUpload.ts: у ещё не созданного материала файл
// проверяют до похода в сеть (useNewMaterialFile.ts, там материала с id ещё
// нет), а отправляют сразу после того, как материал создан. Раньше хук
// useMaterialFileUpload держал обе функции сам, но ему негде было взять
// materialId для загрузки файла, выбранного до создания записи. Сеть — только
// apiFetch (CLAUDE.md).
import {
  MATERIAL_FILE_EMPTY_MESSAGE,
  MATERIAL_FILE_LIMITS,
  MATERIAL_FILE_TOO_LARGE_MESSAGE,
  MATERIAL_FILE_UNSUPPORTED_MESSAGE,
  MATERIAL_FILE_UPLOAD_CONTENT_TYPES,
  type MaterialDto,
} from '@xuanxue/shared';
import { materialFileUploadPath } from '../api/apiPaths';
import { UPLOAD_TIMEOUT_MS, apiFetch } from '../api/http';

// Самое длинное расширение среди принимаемых форматов (application/pdf →
// «.pdf», image/jpeg → «.jpeg», Word и EPUB → «.docx»/«.epub») плюс запас —
// точка дальше в имени файла уже не расширение, а часть названия, обрезать по
// ней не нужно.
const MAX_EXTENSION_LENGTH = 6;

/** Против MATERIAL_FILE_UPLOAD_CONTENT_TYPES, а не MATERIAL_FILE_CONTENT_TYPES:
 * шире на альтернативный `text/rtf` (macOS отдаёт его для RTF вместо
 * `application/rtf`). Здесь только гейт «отправлять ли на сервер» — сам тип
 * файла в ответе решают байты (server, material-file-upload.ts), поэтому
 * узкий тип `MaterialFileContentType` этой функции не нужен. */
function isAcceptedContentType(type: string): boolean {
  return (MATERIAL_FILE_UPLOAD_CONTENT_TYPES as readonly string[]).includes(type);
}

/** `null` — файл подходит; иначе готовый текст ошибки (VOICE.md). Формат и
 * размер — до похода в сеть: с чужим Content-Type сервер даже не включит
 * разбор сырого тела (браузер ставит его из файла), и человек увидел бы
 * невнятную ошибку вместо понятной. */
export function checkMaterialFile(file: File): string | null {
  if (!isAcceptedContentType(file.type)) return MATERIAL_FILE_UNSUPPORTED_MESSAGE;
  if (file.size > MATERIAL_FILE_LIMITS.maxBytes) return MATERIAL_FILE_TOO_LARGE_MESSAGE;
  if (file.size === 0) return MATERIAL_FILE_EMPTY_MESSAGE;
  return null;
}

/** Обрезает длинное имя файла, сохраняя расширение — сервер отверг бы длинное
 * имя целиком (400 на `MATERIAL_FILE_LIMITS.name`), а терять из-за этого уже
 * выбранный и провалидированный файл незачем (в отличие от формата и
 * размера, это не повод отказать). */
function truncateFileName(name: string): string {
  if (name.length <= MATERIAL_FILE_LIMITS.name) return name;
  const dotIndex = name.lastIndexOf('.');
  const extensionLength = name.length - dotIndex;
  const hasExtension = dotIndex > 0 && extensionLength <= MAX_EXTENSION_LENGTH;
  const extension = hasExtension ? name.slice(dotIndex) : '';
  return `${name.slice(0, MATERIAL_FILE_LIMITS.name - extension.length)}${extension}`;
}

/** Файл уже проверен `checkMaterialFile` — здесь только сам запрос. */
export function uploadMaterialFile(materialId: string, file: File): Promise<MaterialDto> {
  const path = materialFileUploadPath(materialId, truncateFileName(file.name));
  // Дефолтных 30 секунд (API_TIMEOUT_MS) файлу на плохой связи ученика
  // может не хватить — свой запас на загрузку (аудит 2026-09-21).
  return apiFetch<MaterialDto>(path, {
    method: 'POST',
    body: file,
    timeoutMs: UPLOAD_TIMEOUT_MS,
  });
}
