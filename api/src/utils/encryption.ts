// AES-256-GCM шифрование свободного текста и секретов каналов (правило
// CLAUDE.md: ENCRYPTION_KEY / ENCRYPTION_KEY_OLD, никогда не ротировать без
// re-encryption). Портировано из telegram-bot-2/src/utils/crypto.ts, без
// Prisma-специфики — здесь только сами примитивы. Ключи и правило «в
// production без ключа не стартуем» — в encryption-keys.ts, общие с
// шифрованием байтов (encryption-bytes.ts).
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import {
  AES_ALGORITHM,
  AES_IV_BYTES,
  AES_TAG_BYTES,
  readKeys,
  warnDecryptFailure,
  writeKey,
} from './encryption-keys';

// Реэкспорт для существующих потребителей (SeedService): сам флаг живёт
// рядом с ключами.
export { isEncryptionConfigured } from './encryption-keys';

export function encrypt(text: string | null | undefined): string | null {
  if (!text) return text ?? null;
  const key = writeKey();
  if (!key) return text;
  const iv = randomBytes(AES_IV_BYTES);
  const cipher = createCipheriv(AES_ALGORITHM, key, iv, { authTagLength: AES_TAG_BYTES });
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decrypt(value: string | null | undefined): string | null {
  const keys = readKeys();
  if (!value || keys.length === 0) return value ?? null;
  let buf: Buffer;
  try {
    buf = Buffer.from(value, 'base64');
    // Хотя бы один байт данных после iv и tag — иначе это не наш формат.
    if (buf.length <= AES_IV_BYTES + AES_TAG_BYTES) return value;
  } catch {
    return value;
  }
  const iv = buf.subarray(0, AES_IV_BYTES);
  const tag = buf.subarray(AES_IV_BYTES, AES_IV_BYTES + AES_TAG_BYTES);
  const data = buf.subarray(AES_IV_BYTES + AES_TAG_BYTES);
  for (const key of keys) {
    try {
      const decipher = createDecipheriv(AES_ALGORITHM, key, iv, {
        authTagLength: AES_TAG_BYTES,
      });
      decipher.setAuthTag(tag);
      return decipher.update(data).toString('utf8') + decipher.final('utf8');
    } catch {
      /* не тот ключ — пробуем следующий */
    }
  }
  warnDecryptFailure();
  return value; // легаси-открытый текст (или испорченный блоб) — возвращаем как есть
}

export function encryptJson(val: unknown): string | null {
  if (val == null) return null;
  return encrypt(JSON.stringify(val));
}

export function decryptJson<T>(val: string | null | undefined): T | null {
  const s = decrypt(val);
  if (s == null) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

// ── Шифрование на уровне записи ─────────────────────────────────────────────
// Схема объявляется один раз рядом с методами модели и используется и на
// запись (encryptRecord), и на чтение (decryptRecord) — гарантирует, что
// поле шифруется/расшифровывается всегда одинаково.
export interface EncryptSchema {
  strings?: string[]; // поля-строки
  jsonArrays?: string[]; // поля, хранящие JSON-массив/объект
}

export function encryptRecord<T extends Record<string, unknown>>(
  data: T,
  schema: EncryptSchema,
): T {
  const out: Record<string, unknown> = { ...data };
  for (const f of schema.strings ?? []) {
    if (out[f] != null) out[f] = encrypt(out[f] as string);
  }
  for (const f of schema.jsonArrays ?? []) {
    if (out[f] != null) out[f] = encryptJson(out[f]) ?? JSON.stringify(out[f]);
  }
  return out as T;
}

export function decryptRecord<T extends Record<string, unknown>>(
  row: T,
  schema: EncryptSchema,
): T {
  const out: Record<string, unknown> = { ...row };
  for (const f of schema.strings ?? []) {
    if (out[f] != null) out[f] = decrypt(out[f] as string);
  }
  for (const f of schema.jsonArrays ?? []) {
    const v = out[f];
    if (v == null) continue;
    if (typeof v === 'string') out[f] = decryptJson(v) ?? v;
  }
  return out as T;
}
