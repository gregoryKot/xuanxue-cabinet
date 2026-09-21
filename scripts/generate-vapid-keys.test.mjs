// Тест генератора пары VAPID (ADR-0092, scripts/generate-vapid-keys.mjs):
// формат и длина ключей — саму криптографию (P-256) проверяет node:crypto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateVapidKeys } from './generate-vapid-keys.mjs';

const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

test('публичный ключ — несжатая точка P-256: 87 символов base64url, 65 байт, начинается с 0x04', () => {
  const { publicKey } = generateVapidKeys();
  assert.match(publicKey, BASE64URL_RE);
  assert.equal(publicKey.length, 87);
  const raw = Buffer.from(publicKey, 'base64url');
  assert.equal(raw.length, 65);
  assert.equal(raw[0], 0x04);
});

test('приватный ключ — 43 символа base64url, 32 байта', () => {
  const { privateKey } = generateVapidKeys();
  assert.match(privateKey, BASE64URL_RE);
  assert.equal(privateKey.length, 43);
  assert.equal(Buffer.from(privateKey, 'base64url').length, 32);
});

test('два вызова подряд дают разные пары — не зашитый пример', () => {
  const a = generateVapidKeys();
  const b = generateVapidKeys();
  assert.notEqual(a.publicKey, b.publicKey);
  assert.notEqual(a.privateKey, b.privateKey);
});
