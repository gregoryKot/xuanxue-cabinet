// Имя, под которым браузер сохранит скачанный файл (ADR-0057). Исходное
// имя приходит от учителя, поэтому чистится на входе, а не на выходе:
// значение попадает в заголовок `Content-Disposition` подписанной ссылки, и
// перевод строки в нём — это второй заголовок в ответе хранилища.
//
// Чистая функция без Mongo и без DI (CLAUDE.md «Логика вне контроллеров»).
import { MATERIAL_FILE_LIMITS } from '@xuanxue/shared';

// Управляющие символы, разделители пути и кавычки — всё, чем ломают
// заголовок или подсовывают путь вместо имени. Диапазон собирается
// `String.fromCharCode`, а не литералом в регэкспе: eslint (no-control-regex)
// запрещает управляющие символы прямо в выражении, и он прав — в исходнике
// их не видно глазами.
const CONTROL_CHARS = Array.from({ length: 0x20 }, (_, code) =>
  String.fromCharCode(code),
).join('');
const UNSAFE = new RegExp(`[${CONTROL_CHARS}\\u007f"\\\\/]+`, 'g');
const FALLBACK = 'material';

export function safeFileName(name: string): string {
  const cleaned = name.replace(UNSAFE, ' ').trim().slice(0, MATERIAL_FILE_LIMITS.name);
  return cleaned.length > 0 ? cleaned : FALLBACK;
}
