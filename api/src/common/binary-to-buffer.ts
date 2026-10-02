// Buffer-поле из `.lean()` в настоящий Buffer. Нужно всем, кто читает байты из
// Mongo мимо гидрации: картинки вариантов (ADR-0035), снимки оплат (ADR-0050),
// кадр-превью видео (ADR-0165) — одно место, не по копии в каждом домене.
interface WithBufferField {
  buffer: unknown;
}

function hasBufferField(value: unknown): value is WithBufferField {
  return typeof value === 'object' && value !== null && 'buffer' in value;
}

/** `.lean()` отдаёт Buffer-поле не как Buffer, а как `mongodb.Binary`
 * (`{ buffer: Uint8Array, sub_type, position }`) — проверено экспериментом
 * на этой версии Mongoose (9.9.x): гидрированный документ даёт настоящий
 * Buffer, `.lean()` — нет. Принимает оба случая и голый Uint8Array (на
 * случай будущего чтения мимо .lean()); всё остальное — программная
 * ошибка, не пользовательский случай. */
export function binaryToBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (hasBufferField(value) && value.buffer instanceof Uint8Array) {
    return Buffer.from(value.buffer);
  }
  throw new Error(
    'binaryToBuffer: неизвестный формат Buffer-поля (ни Buffer, ни Binary)',
  );
}
