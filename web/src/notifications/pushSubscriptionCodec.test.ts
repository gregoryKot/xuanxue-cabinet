// Юнит-тесты конвертеров base64url (ADR-0092, PR №5): ошибка здесь тихая
// (ТЗ) — subscribe() либо бросит уже на сервере, либо тихо не отправит
// ключи в нужном виде, поэтому раунд-трип и известный вектор проверяются
// отдельно от usePushSubscription.ts.
import { describe, expect, it } from 'vitest';
import { PUSH_SUBSCRIPTION_KEY_RE } from '@xuanxue/shared';
import { arrayBufferToBase64Url, base64UrlToUint8Array } from './pushSubscriptionCodec';

describe('base64UrlToUint8Array', () => {
  it('декодирует известную строку без паддинга — base64url("hello")', () => {
    const bytes = base64UrlToUint8Array('aGVsbG8');

    expect(new TextDecoder().decode(bytes)).toBe('hello');
  });

  it('раунд-трип с байтами, которые в обычном base64 дают "+"/"/" — подстановка символов сработала', () => {
    const original = new Uint8Array([0, 1, 2, 253, 254, 255]);

    const encoded = arrayBufferToBase64Url(original.buffer);
    // Символы, которые pushManager.subscribe() и сервер (PUSH_SUBSCRIPTION_KEY_RE)
    // не примут — "+", "/", "=" — не должны попасть в результат.
    expect(encoded).toMatch(PUSH_SUBSCRIPTION_KEY_RE);
    expect(base64UrlToUint8Array(encoded)).toEqual(original);
  });
});

describe('arrayBufferToBase64Url', () => {
  it('кодирует без паддинга — известный вектор base64url("hello")', () => {
    const bytes = new TextEncoder().encode('hello');

    expect(arrayBufferToBase64Url(bytes.buffer)).toBe('aGVsbG8');
  });

  it('раунд-трип на 65 байтах — длина несжатой точки P-256, как у настоящего ключа VAPID', () => {
    const bytes = new Uint8Array(65);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 37 + 5) % 256;

    const encoded = arrayBufferToBase64Url(bytes.buffer);

    expect(encoded).toMatch(PUSH_SUBSCRIPTION_KEY_RE);
    expect(base64UrlToUint8Array(encoded)).toEqual(bytes);
  });
});
