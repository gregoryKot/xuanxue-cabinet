// AES-256-GCM шифрование свободного текста и секретов каналов (правило
// CLAUDE.md: ENCRYPTION_KEY / ENCRYPTION_KEY_OLD, никогда не ротировать без
// re-encryption). Портировано из telegram-bot-2/src/utils/crypto.ts, без
// Prisma-специфики — здесь только сами примитивы.
//
// Мульти-ключ для онлайн-ротации:
//   ENCRYPTION_KEY     — текущий ключ, им шифруется ВСЁ новое.
//   ENCRYPTION_KEY_OLD — старые ключи через запятую, пробуются только при расшифровке.
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { Logger } from '@nestjs/common';

// Статический логгер модуля (не DI-сервис — файл не инстанцируется Nest'ом,
// это набор чистых функций шифрования). no-console запрещает console.* в
// api/src — CLAUDE.md, раздел «Обработка ошибок».
const logger = new Logger('Encryption');

function loadKeys(): { current: Buffer | null; all: Buffer[] } {
  const parse = (hex: string): Buffer | null =>
    hex.length === 64 ? Buffer.from(hex, 'hex') : null;
  const cur = parse((process.env.ENCRYPTION_KEY ?? '').trim());
  const olds = (process.env.ENCRYPTION_KEY_OLD ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(parse)
    .filter((k): k is Buffer => k !== null);
  const all = [cur, ...olds].filter((k): k is Buffer => k !== null);
  return { current: cur, all };
}
const { current: CURRENT_KEY, all: ALL_KEYS } = loadKeys();

if (process.env.NODE_ENV === 'production' && !CURRENT_KEY) {
  // Падение при старте лучше, чем молчаливое хранение свободного текста
  // (дневников, ссылок с паролями) в открытом виде.
  throw new Error(
    'FATAL: ENCRYPTION_KEY отсутствует или неверной длины в production. ' +
      "Сгенерировать: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
  );
}

/** Ключ настроен (валидный ENCRYPTION_KEY). В отличие от encrypt() (тихо
 * хранит plain text вне production), SeedService сам решает отказаться. */
export function isEncryptionConfigured(): boolean {
  return CURRENT_KEY !== null;
}

export function encrypt(text: string | null | undefined): string | null {
  if (!text) return text ?? null;
  if (!CURRENT_KEY) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ENCRYPTION_KEY не настроен — отказ хранить открытый текст');
    }
    return text;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', CURRENT_KEY, iv, { authTagLength: 16 });
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

let lastDecryptWarnAt = 0;
function warnDecryptFailure(): void {
  const now = Date.now();
  if (now - lastDecryptWarnAt < 60_000) return;
  lastDecryptWarnAt = now;
  logger.warn(
    'decrypt: blob похож на шифротекст, но не расшифровался ни одним ключом — ' +
      'возможна порча данных или неполная ротация ENCRYPTION_KEY',
  );
}

export function decrypt(value: string | null | undefined): string | null {
  if (!value || ALL_KEYS.length === 0) return value ?? null;
  let buf: Buffer;
  try {
    buf = Buffer.from(value, 'base64');
    if (buf.length < 29) return value; // не наш формат
  } catch {
    return value;
  }
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  for (const key of ALL_KEYS) {
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
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
