#!/usr/bin/env node
// Печатает пару ключей VAPID (ADR-0092) для .env — без неё владелец не
// включит push (CLAUDE.md «Продуктовая…»: риск за флагом, отсутствие ключей
// и есть выключатель). P-256 на встроенном `crypto` — тот же приём, что у
// HMAC-JWT сессии (ADR-0012, api/src/auth/session-token.ts): своя подпись
// вместо сторонней библиотеки (CLAUDE.md «Зависимости»).
//
// Публичный ключ — несжатая точка EC (0x04 + X + Y, 65 байт), приватный —
// сырой скаляр `d` (32 байта): оба в base64url без паддинга — формат, в
// котором браузер (`pushManager.subscribe({ applicationServerKey })`) и
// подпись VAPID (RFC 8292) их ожидают. JWK — не итоговое хранение, а
// единственный переносимый способ достать сырые X/Y/d из KeyObject
// (`export({ format: 'raw' })` для EC есть не во всех LTS-версиях Node).
//
// Запуск: node scripts/generate-vapid-keys.mjs
import { generateKeyPairSync } from 'crypto';

const CURVE = 'prime256v1';
const UNCOMPRESSED_POINT_PREFIX = Buffer.from([0x04]);

/** Пара VAPID-ключей в формате, который кладут в env (ADR-0092). */
export function generateVapidKeys() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: CURVE });
  const publicJwk = publicKey.export({ format: 'jwk' });
  const privateJwk = privateKey.export({ format: 'jwk' });
  if (!publicJwk.x || !publicJwk.y || !privateJwk.d) {
    throw new Error('generateVapidKeys: JWK без x/y/d — не EC-ключ P-256');
  }

  const point = Buffer.concat([
    UNCOMPRESSED_POINT_PREFIX,
    Buffer.from(publicJwk.x, 'base64url'),
    Buffer.from(publicJwk.y, 'base64url'),
  ]);

  return {
    publicKey: point.toString('base64url'),
    // `d` уже 32 байта в base64url (JWK хранит координаты фиксированной
    // длины, RFC 7518 §6.2.1) — пересчитывать нечего.
    privateKey: privateJwk.d,
  };
}

function main() {
  const { publicKey, privateKey } = generateVapidKeys();
  console.log('Добавьте в .env (или Railway → Variables) и перезапустите сервис:');
  console.log('');
  console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
  console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
  console.log('VAPID_SUBJECT=mailto:адрес-школы@пример.ru');
  console.log('');
  console.log(
    'Смена пары обнуляет все подписки — людям придётся разрешить уведомления заново ' +
      '(docs/RUNBOOK.md §6.5).',
  );
}

// Запуск как самостоятельный скрипт — не при импорте из теста
// (import.meta.url !== process.argv[1] в этом случае).
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
