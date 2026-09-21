// Юнит без Mongo (CLAUDE.md «Тесты»): хранение (listEndpointsFor/unsubscribe)
// уже покрыто против mongodb-memory-server в push-subscriptions.service.spec.ts
// — здесь PushSubscriptionsService подменяется фейком, важно только «шлём
// правильный запрос по каждой подписке и правильно реагируем на ответ». fetch
// подменяется на globalThis — сеть не трогаем, тот же приём, что
// mail.service.spec.ts. Ключи VAPID — настоящая пара P-256 (тем же приёмом,
// что vapid-jwt.spec.ts): PushSenderService реально вызывает signVapidRequest,
// плейсхолдер вроде 'A'.repeat(87) не пройдёт createPrivateKey({format:'jwk'}).
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { generateKeyPairSync } from 'crypto';
import { DateTime } from 'luxon';
import { PushSenderService } from './push-sender.service';
import type { PushSubscriptionsService } from './push-subscriptions.service';
import type { VapidConfig } from './vapid.config';

function realVapidPair(subject: string): VapidConfig {
  const { publicKey, privateKey } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  const publicJwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string };
  const privateJwk = privateKey.export({ format: 'jwk' }) as { d: string };
  const point = Buffer.concat([
    Buffer.from([0x04]),
    Buffer.from(publicJwk.x, 'base64url'),
    Buffer.from(publicJwk.y, 'base64url'),
  ]);
  return { publicKey: point.toString('base64url'), privateKey: privateJwk.d, subject };
}

function configFrom(vapid: VapidConfig | null): ConfigService {
  const values: Record<string, string | undefined> = vapid
    ? {
        VAPID_PUBLIC_KEY: vapid.publicKey,
        VAPID_PRIVATE_KEY: vapid.privateKey,
        VAPID_SUBJECT: vapid.subject,
      }
    : {};
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function fakeSubscriptions(endpoints: string[]) {
  const listEndpointsFor = jest.fn().mockResolvedValue(endpoints);
  const unsubscribe = jest.fn().mockResolvedValue(undefined);
  const service = {
    listEndpointsFor,
    unsubscribe,
  } as unknown as PushSubscriptionsService;
  return { service, listEndpointsFor, unsubscribe };
}

function response(status: number): Response {
  return { ok: status >= 200 && status < 300, status } as Response;
}

const VAPID = realVapidPair('mailto:school@example.com');
const NOW = DateTime.fromISO('2026-09-21T12:00:00Z', { zone: 'utc' });
const ENDPOINT_A = 'https://fcm.googleapis.com/fcm/send/device-a';
const ENDPOINT_B = 'https://updates.push.services.mozilla.com/wpush/v2/device-b';

describe('PushSenderService.sendToUser', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('push выключен (нет VAPID) — 0, ни базы, ни сети не трогает', async () => {
    const { service: subs, listEndpointsFor } = fakeSubscriptions([ENDPOINT_A]);
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    const sender = new PushSenderService(configFrom(null), subs);

    await expect(sender.sendToUser('u1', NOW)).resolves.toBe(0);

    expect(listEndpointsFor).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('у человека нет подписок — 0, сеть не трогает', async () => {
    const { service: subs } = fakeSubscriptions([]);
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    const sender = new PushSenderService(configFrom(VAPID), subs);

    await expect(sender.sendToUser('u1', NOW)).resolves.toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('успех — POST без тела, с Authorization/TTL/Content-Length, без Content-Encoding', async () => {
    const { service: subs } = fakeSubscriptions([ENDPOINT_A]);
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(response(201));
    const sender = new PushSenderService(configFrom(VAPID), subs);

    await expect(sender.sendToUser('u1', NOW)).resolves.toBe(1);

    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe(ENDPOINT_A);
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeUndefined();
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toMatch(
      new RegExp(`^vapid t=[^,]+, k=${VAPID.publicKey}$`),
    );
    expect(headers.TTL).toBe('86400');
    expect(headers['Content-Length']).toBe('0');
    expect(headers['Content-Encoding']).toBeUndefined();
  });

  it('одному человеку — по всем его подпискам разом (телефон, ноутбук)', async () => {
    const { service: subs } = fakeSubscriptions([ENDPOINT_A, ENDPOINT_B]);
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(response(201));
    const sender = new PushSenderService(configFrom(VAPID), subs);

    await expect(sender.sendToUser('u1', NOW)).resolves.toBe(2);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const sentTo = fetchSpy.mock.calls.map(([url]) => url);
    expect(sentTo.sort()).toEqual([ENDPOINT_A, ENDPOINT_B].sort());
  });

  it('отказ одной подписки не прекращает отправку по другим', async () => {
    const { service: subs } = fakeSubscriptions([ENDPOINT_A, ENDPOINT_B]);
    jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(response(201));
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const sender = new PushSenderService(configFrom(VAPID), subs);

    // «Пытались» на обеих, даже если одна упала сетью.
    await expect(sender.sendToUser('u1', NOW)).resolves.toBe(2);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('network down'),
      expect.any(String),
    );
  });

  it.each([404, 410])(
    'мёртвая подписка (%d) — отписывает по (userId, endpoint), без error-лога',
    async (status) => {
      const { service: subs, unsubscribe } = fakeSubscriptions([ENDPOINT_A]);
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(response(status));
      const error = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      const sender = new PushSenderService(configFrom(VAPID), subs);

      await sender.sendToUser('u1', NOW);

      expect(unsubscribe).toHaveBeenCalledWith('u1', ENDPOINT_A);
      expect(error).not.toHaveBeenCalled();
    },
  );

  it('прочий отказ (429) — error-лог со статусом, подписку не трогает', async () => {
    const { service: subs, unsubscribe } = fakeSubscriptions([ENDPOINT_A]);
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(response(429));
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const sender = new PushSenderService(configFrom(VAPID), subs);

    await sender.sendToUser('u1', NOW);

    expect(unsubscribe).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('429'));
  });

  it('сетевая ошибка — error-лог со стеком, подписку не трогает, не бросает наружу', async () => {
    const { service: subs, unsubscribe } = fakeSubscriptions([ENDPOINT_A]);
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('boom'));
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const sender = new PushSenderService(configFrom(VAPID), subs);

    await expect(sender.sendToUser('u1', NOW)).resolves.toBe(1);

    expect(unsubscribe).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('boom'),
      expect.any(String),
    );
  });

  it('error-лог никогда не несёт endpoint строкой (redact-paths покрывает только структурные поля)', async () => {
    const { service: subs } = fakeSubscriptions([ENDPOINT_A]);
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(response(500));
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const sender = new PushSenderService(configFrom(VAPID), subs);

    await sender.sendToUser('u1', NOW);

    expect(JSON.stringify(error.mock.calls)).not.toContain(ENDPOINT_A);
  });
});
