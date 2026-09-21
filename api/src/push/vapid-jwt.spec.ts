// Юнит без Mongo и без сети (CLAUDE.md «Тесты») — но не игрушечный: ключевая
// проверка ниже реально проверяет подпись через crypto.verify той же
// публичной парой, на настоящей ECDSA P-256 паре (сгенерированной тем же
// приёмом, что scripts/generate-vapid-keys.mjs — сам .mjs-скрипт не
// импортируем: он вне rootDir api/ и написан как ESM, а jest здесь гоняет
// ts-jest на CommonJS, cross-package require(esm) — источник хрупкости без
// прецедента в проекте). Только это ловит DER-вместо-raw: собранный JWT,
// который просто разобрался JSON.parse'ом, ловушку не покажет — DER тоже
// валидный JSON внутри valid base64url.
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as signEcdsa,
  verify as verifyEcdsa,
} from 'crypto';
import { DateTime } from 'luxon';
import { signVapidRequest } from './vapid-jwt';
import type { VapidConfig } from './vapid.config';

/** Реальная пара P-256 в форме VapidConfig — та же трансформация (несжатая
 * точка 0x04||X||Y для публичного, сырой `d` для приватного), что
 * generateVapidKeys() в scripts/generate-vapid-keys.mjs (см. шапку файла —
 * почему не импортируем сам скрипт). */
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

function publicKeyObjectFrom(config: VapidConfig) {
  const point = Buffer.from(config.publicKey, 'base64url');
  return createPublicKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      x: point.subarray(1, 33).toString('base64url'),
      y: point.subarray(33, 65).toString('base64url'),
    },
    format: 'jwk',
  });
}

function privateKeyObjectFrom(config: VapidConfig) {
  const point = Buffer.from(config.publicKey, 'base64url');
  return createPrivateKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      x: point.subarray(1, 33).toString('base64url'),
      y: point.subarray(33, 65).toString('base64url'),
      d: config.privateKey,
    },
    format: 'jwk',
  });
}

function decodeJwtPart<T>(jwt: string, index: number): T {
  const part = jwt.split('.')[index] ?? '';
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as T;
}

const NOW = DateTime.fromISO('2026-09-21T12:00:00Z', { zone: 'utc' });
const SUBJECT = 'mailto:school@example.com';
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/device-abc123?token=xyz';

describe('signVapidRequest', () => {
  it('JWT: заголовок ES256, payload с aud=origin эндпоинта (без пути/query) и sub', () => {
    const config = realVapidPair(SUBJECT);

    const { jwt } = signVapidRequest(config, ENDPOINT, NOW);

    expect(decodeJwtPart(jwt, 0)).toEqual({ typ: 'JWT', alg: 'ES256' });
    const payload = decodeJwtPart<{ aud: string; exp: number; sub: string }>(jwt, 1);
    expect(payload.aud).toBe('https://fcm.googleapis.com');
    expect(payload.sub).toBe(SUBJECT);
  });

  it('exp — ровно now + 12 часов, в будущем и не дальше суток (RFC 8292)', () => {
    const config = realVapidPair(SUBJECT);

    const { jwt } = signVapidRequest(config, ENDPOINT, NOW);

    const payload = decodeJwtPart<{ exp: number }>(jwt, 1);
    const nowSec = Math.floor(NOW.toSeconds());
    expect(payload.exp).toBe(Math.floor(NOW.plus({ hours: 12 }).toSeconds()));
    expect(payload.exp).toBeGreaterThan(nowSec);
    expect(payload.exp).toBeLessThanOrEqual(nowSec + 24 * 60 * 60);
  });

  it('заголовок Authorization — форма "vapid t=<jwt>, k=<publicKey>"', () => {
    const config = realVapidPair(SUBJECT);

    const { jwt, authorizationHeader } = signVapidRequest(config, ENDPOINT, NOW);

    expect(authorizationHeader).toBe(`vapid t=${jwt}, k=${config.publicKey}`);
  });

  // Ключевая проверка модуля: подпись реальна и проходит crypto.verify тем
  // же публичным ключом в формате raw (ieee-p1363) — ровно то, что сверяет
  // push-сервис. JSON.parse('верного вида' объекта) прошёл бы и с DER, эта
  // проверка — нет.
  it('подпись проходит crypto.verify тем же публичным ключом (raw r||s, не DER)', () => {
    const config = realVapidPair(SUBJECT);
    const { jwt } = signVapidRequest(config, ENDPOINT, NOW);
    const [header, payload, signatureB64] = jwt.split('.');
    const signature = Buffer.from(signatureB64 ?? '', 'base64url');

    // r||s фиксированной длины для P-256 — 32 + 32 байта. DER той же подписи
    // почти никогда не даёт ровно 64 байта (ASN.1-обёртка и знаковые байты
    // варьируют длину) — уже отдельный сигнал, что формат тот, что нужен.
    expect(signature.length).toBe(64);

    const ok = verifyEcdsa(
      'sha256',
      Buffer.from(`${header}.${payload}`, 'utf8'),
      { key: publicKeyObjectFrom(config), dsaEncoding: 'ieee-p1363' },
      signature,
    );
    expect(ok).toBe(true);
  });

  // Регрессия ровно на ловушку из шапки vapid-jwt.ts: та же пара, тот же
  // алгоритм и данные — но DER (дефолт crypto.sign без dsaEncoding) не
  // проходит verify в формате raw. Если кто-то уберёт `dsaEncoding:
  // 'ieee-p1363'' из signVapidRequest, его результат станет неотличим от
  // signature ниже — и тест «подпись проходит verify» выше перестанет
  // проходить, а не молча позеленеет.
  it('DER-подпись той же пары НЕ проходит verify в формате raw — вот эту ошибку ловит тест', () => {
    const config = realVapidPair(SUBJECT);
    const { jwt } = signVapidRequest(config, ENDPOINT, NOW);
    const [header, payload] = jwt.split('.');
    const data = Buffer.from(`${header}.${payload}`, 'utf8');

    const derSignature = signEcdsa('sha256', data, privateKeyObjectFrom(config)); // без dsaEncoding — DER

    const ok = verifyEcdsa(
      'sha256',
      data,
      { key: publicKeyObjectFrom(config), dsaEncoding: 'ieee-p1363' },
      derSignature,
    );
    expect(ok).toBe(false);
  });

  it('разные endpoint — разный aud, тот же subject', () => {
    const config = realVapidPair(SUBJECT);

    const a = signVapidRequest(config, 'https://fcm.googleapis.com/fcm/send/x', NOW);
    const b = signVapidRequest(
      config,
      'https://updates.push.services.mozilla.com/wpush/v2/y',
      NOW,
    );

    expect(decodeJwtPart<{ aud: string }>(a.jwt, 1).aud).toBe(
      'https://fcm.googleapis.com',
    );
    expect(decodeJwtPart<{ aud: string }>(b.jwt, 1).aud).toBe(
      'https://updates.push.services.mozilla.com',
    );
  });
});
