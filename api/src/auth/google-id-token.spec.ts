// Юнит-тест проверки id_token (google-id-token.ts) — БЕЗ проверки подписи
// (см. комментарий-шапку в файле, почему это безопасно для этого потока):
// токены здесь собраны вручную с произвольной третьей частью, реальная
// подпись не нужна ни коду, ни тесту.
import { DateTime } from 'luxon';
import { parseGoogleIdToken } from './google-id-token';

const CLIENT_ID = 'client.apps.googleusercontent.com';
const NONCE = 'n'.repeat(22);
const NOW = DateTime.fromISO('2026-09-28T10:00:00Z');

function token(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString(
    'base64url',
  );
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${header}.${payload}.fake-signature`;
}

function validClaims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    sub: 'google-sub-1',
    exp: NOW.plus({ minutes: 5 }).toSeconds(),
    nonce: NONCE,
    email: 'Anna@Gmail.com',
    email_verified: true,
    given_name: 'Анна',
    family_name: 'Петрова',
    name: 'Анна Петрова',
    ...overrides,
  };
}

function parse(claims: Record<string, unknown>) {
  return parseGoogleIdToken(token(claims), {
    clientId: CLIENT_ID,
    nonce: NONCE,
    now: NOW,
  });
}

describe('parseGoogleIdToken — успех', () => {
  it('валидный токен → identity с email в нижнем регистре', () => {
    const identity = parse(validClaims());
    expect(identity).toEqual({
      sub: 'google-sub-1',
      email: 'anna@gmail.com',
      emailVerified: true,
      emailAuthoritative: true,
      givenName: 'Анна',
      familyName: 'Петрова',
      name: 'Анна Петрова',
    });
  });

  it('iss без https:// (accounts.google.com) тоже принимается', () => {
    expect(() => parse(validClaims({ iss: 'accounts.google.com' }))).not.toThrow();
  });

  it('aud массивом + azp === clientId — принимается', () => {
    expect(() =>
      parse(validClaims({ aud: [CLIENT_ID, 'другой'], azp: CLIENT_ID })),
    ).not.toThrow();
  });
});

describe('parseGoogleIdToken — отказы', () => {
  it('не JWT (меньше трёх частей)', () => {
    expect(() =>
      parseGoogleIdToken('не.jwt', { clientId: CLIENT_ID, nonce: NONCE, now: NOW }),
    ).toThrow();
  });

  it('payload — не валидный base64url JSON', () => {
    expect(() =>
      parseGoogleIdToken('a.не-base64.c', {
        clientId: CLIENT_ID,
        nonce: NONCE,
        now: NOW,
      }),
    ).toThrow();
  });

  it('неизвестный iss', () => {
    expect(() => parse(validClaims({ iss: 'https://evil.example' }))).toThrow();
  });

  it('aud строкой не совпадает с client_id', () => {
    expect(() => parse(validClaims({ aud: 'другой-клиент' }))).toThrow();
  });

  it('aud массивом без совпадающего azp', () => {
    expect(() =>
      parse(validClaims({ aud: [CLIENT_ID], azp: 'другой-клиент' })),
    ).toThrow();
  });

  it('exp в прошлом', () => {
    expect(() =>
      parse(validClaims({ exp: NOW.minus({ minutes: 1 }).toSeconds() })),
    ).toThrow();
  });

  it('exp равен now (не строго в будущем)', () => {
    expect(() => parse(validClaims({ exp: NOW.toSeconds() }))).toThrow();
  });

  it('nonce не совпадает с cookie', () => {
    expect(() => parse(validClaims({ nonce: 'другой' }))).toThrow();
  });

  it('sub отсутствует', () => {
    const { sub: _drop, ...rest } = validClaims();
    expect(() => parse(rest)).toThrow();
  });

  it('sub длиннее 255 символов', () => {
    expect(() => parse(validClaims({ sub: 'x'.repeat(256) }))).toThrow();
  });
});

describe('parseGoogleIdToken — emailAuthoritative (ADR-0145)', () => {
  it('gmail.com — authoritative', () => {
    expect(parse(validClaims({ email: 'a@gmail.com' })).emailAuthoritative).toBe(true);
  });

  it('googlemail.com — authoritative', () => {
    expect(parse(validClaims({ email: 'a@googlemail.com' })).emailAuthoritative).toBe(
      true,
    );
  });

  it('Workspace-домен с совпадающим hd — authoritative', () => {
    const identity = parse(
      validClaims({ email: 'a@school.example', hd: 'School.Example' }),
    );
    expect(identity.emailAuthoritative).toBe(true);
  });

  it('hd задан, но не совпадает с доменом email — не authoritative', () => {
    const identity = parse(
      validClaims({ email: 'a@school.example', hd: 'other.example' }),
    );
    expect(identity.emailAuthoritative).toBe(false);
  });

  it('email_verified: false — не authoritative, даже gmail.com', () => {
    const identity = parse(validClaims({ email: 'a@gmail.com', email_verified: false }));
    expect(identity.emailVerified).toBe(false);
    expect(identity.emailAuthoritative).toBe(false);
  });

  it('обычный домен без hd — не authoritative', () => {
    const identity = parse(validClaims({ email: 'a@example.com' }));
    expect(identity.emailAuthoritative).toBe(false);
  });

  it('email отсутствует вовсе — не authoritative, email undefined', () => {
    const { email: _drop, ...rest } = validClaims();
    const identity = parse(rest);
    expect(identity.email).toBeUndefined();
    expect(identity.emailAuthoritative).toBe(false);
  });
});
