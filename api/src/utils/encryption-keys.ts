// Ключи AES-256-GCM — одни на шифрование строк (encryption.ts) и байтов
// (encryption-bytes.ts, картинки вариантов ответа, ADR-0035): два набора
// примитивов, но ротация (RUNBOOK §6.1) и правило «в production без ключа
// не стартуем» — одни на всех, поэтому чтение env и ключи живут здесь.
//
// Мульти-ключ для онлайн-ротации:
//   ENCRYPTION_KEY     — текущий ключ, им шифруется ВСЁ новое.
//   ENCRYPTION_KEY_OLD — старые ключи через запятую, пробуются только при расшифровке.
//
// process.env читается один раз при импорте модуля — вместе с самим
// валидатором env это единственное разрешённое чтение мимо ConfigService
// (CLAUDE.md «Конфигурация»): примитивы шифрования — чистые функции, DI им
// не положен.
import { Logger } from '@nestjs/common';

// Статический логгер модуля (не DI-сервис — файл не инстанцируется Nest'ом).
// no-console запрещает console.* в api/src — CLAUDE.md, раздел «Ошибки».
const logger = new Logger('Encryption');

/** Раскладка шифротекста в обоих форматах: iv | tag | данные. */
export const AES_IV_BYTES = 12;
export const AES_TAG_BYTES = 16;
export const AES_ALGORITHM = 'aes-256-gcm';

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

/** Ключ настроен (валидный ENCRYPTION_KEY). */
export function isEncryptionConfigured(): boolean {
  return CURRENT_KEY !== null;
}

/** Ключ для записи: `null` — ключа нет и это не production, вызывающий код
 * хранит открытые данные как есть (локальная разработка без ключа); в
 * production отсутствие ключа — отказ, не тихий открытый текст. */
export function writeKey(): Buffer | null {
  if (CURRENT_KEY) return CURRENT_KEY;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('ENCRYPTION_KEY не настроен — отказ хранить открытый текст');
  }
  return null;
}

/** Все ключи на чтение: текущий первым, потом старые (ротация). Пустой
 * список — шифрование не настроено, данные хранились как есть. */
export function readKeys(): readonly Buffer[] {
  return ALL_KEYS;
}

let lastDecryptWarnAt = 0;
/** Не чаще раза в минуту — иначе битая запись, которую читают в цикле,
 * засыпает лог одинаковыми строками. */
export function warnDecryptFailure(): void {
  const now = Date.now();
  if (now - lastDecryptWarnAt < 60_000) return;
  lastDecryptWarnAt = now;
  logger.warn(
    'decrypt: blob похож на шифротекст, но не расшифровался ни одним ключом — ' +
      'возможна порча данных или неполная ротация ENCRYPTION_KEY',
  );
}
