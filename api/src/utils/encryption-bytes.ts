// AES-256-GCM для двоичных данных — картинки вариантов ответа (ADR-0035,
// `exam_images.bytes`). Свой примитив, а не `encrypt(buf.toString('base64'))`:
// base64 внутри base64 раздул бы каждую картинку на 78 %, а хранить строкой
// вместо Buffer — ещё и мешал бы Mongo отдавать её как двоичное поле.
// Раскладка та же, что у строк (encryption.ts): iv | tag | данные, только
// без base64 — Buffer как есть. Ключи, ротация и правило «в production без
// ключа не стартуем» — общие, encryption-keys.ts.
//
// Поле вне `fieldPolicy`/`encryptRecord` (те умеют только строки верхнего
// уровня): скрипт ротации ключа (RUNBOOK §6.1) обязан перешифровать
// `exam_images.bytes` этими функциями отдельно от MODEL_DEFINITIONS.
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import {
  AES_ALGORITHM,
  AES_IV_BYTES,
  AES_TAG_BYTES,
  readKeys,
  warnDecryptFailure,
  writeKey,
} from './encryption-keys';

export function encryptBytes(data: Buffer): Buffer {
  const key = writeKey();
  if (!key) return data;
  const iv = randomBytes(AES_IV_BYTES);
  const cipher = createCipheriv(AES_ALGORITHM, key, iv, { authTagLength: AES_TAG_BYTES });
  const enc = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]);
}

/** Не расшифровалось ни одним ключом (ключа не было при записи, ротация не
 * доведена, порча) — возвращает вход как есть, с тем же warn, что у строк:
 * тихо подменить картинку пустотой хуже, чем отдать то, что лежит. */
export function decryptBytes(data: Buffer): Buffer {
  const keys = readKeys();
  // Пустая картинка и в шифрованном виде не короче iv и tag — всё, что
  // короче, шифротекстом быть не может (записано без ключа).
  if (keys.length === 0 || data.length < AES_IV_BYTES + AES_TAG_BYTES) return data;
  const iv = data.subarray(0, AES_IV_BYTES);
  const tag = data.subarray(AES_IV_BYTES, AES_IV_BYTES + AES_TAG_BYTES);
  const enc = data.subarray(AES_IV_BYTES + AES_TAG_BYTES);
  for (const key of keys) {
    try {
      const decipher = createDecipheriv(AES_ALGORITHM, key, iv, {
        authTagLength: AES_TAG_BYTES,
      });
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(enc), decipher.final()]);
    } catch {
      /* не тот ключ — пробуем следующий */
    }
  }
  warnDecryptFailure();
  return data;
}
