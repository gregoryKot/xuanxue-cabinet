// Юнит-тест проверки id_token Telegram (telegram-oidc-id-token.ts) — БЕЗ
// проверки подписи (причина в шапке файла): токены собраны вручную с
// произвольной третьей частью. Образец claims — пример из документации Telegram.
import { DateTime } from 'luxon';
import { NEW_PERSON_NAME } from '@xuanxue/shared';
import { parseTelegramIdToken } from './telegram-oidc-id-token';

const CLIENT_ID = '123456789';
const NOW = DateTime.fromISO('2026-10-26T10:00:00Z');

function token(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString(
    'base64url',
  );
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${header}.${payload}.fake-signature`;
}

function validClaims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    iss: 'https://oauth.telegram.org',
    aud: CLIENT_ID,
    sub: '1234123412341234123',
    iat: NOW.toSeconds(),
    exp: NOW.plus({ minutes: 5 }).toSeconds(),
    id: 987654321,
    name: 'John Doe',
    given_name: 'John',
    family_name: 'Doe',
    preferred_username: 'johndoe',
    ...overrides,
  };
}

function parse(claims: Record<string, unknown>) {
  return parseTelegramIdToken(token(claims), { clientId: CLIENT_ID, now: NOW });
}

/** Без ключа вовсе — иначе `undefined` в overrides затёр бы его, но оставил поле. */
function without(...keys: string[]): Record<string, unknown> {
  const claims = validClaims();
  for (const key of keys) delete claims[key];
  return claims;
}

describe('parseTelegramIdToken — успех', () => {
  it('claim id — ключ входа, имя из given_name и family_name', () => {
    expect(parse(validClaims())).toEqual({ telegramId: 987654321, name: 'John Doe' });
  });

  it('id строкой цифр принимается', () => {
    expect(parse(validClaims({ id: '987654321' })).telegramId).toBe(987654321);
  });

  it('aud массивом с нашим клиентом принимается', () => {
    expect(() => parse(validClaims({ aud: ['другой', CLIENT_ID] }))).not.toThrow();
  });

  it('sub не участвует: он непрозрачный и с Telegram ID не связан', () => {
    expect(parse(validClaims({ sub: 'совсем-другой' })).telegramId).toBe(987654321);
  });
});

describe('parseTelegramIdToken — имя', () => {
  it('только given_name — без пробела на конце', () => {
    expect(parse(without('family_name')).name).toBe('John');
  });

  it('только family_name', () => {
    expect(parse(without('given_name')).name).toBe('Doe');
  });

  it('нет given/family — берётся name', () => {
    expect(parse(without('given_name', 'family_name')).name).toBe('John Doe');
  });

  it('нет имени вовсе — preferred_username', () => {
    expect(parse(without('given_name', 'family_name', 'name')).name).toBe('johndoe');
  });

  it('нет ни одного поля имени — заглушка, вход не падает', () => {
    const claims = without('given_name', 'family_name', 'name', 'preferred_username');
    expect(parse(claims).name).toBe(NEW_PERSON_NAME);
  });

  it('пустые и пробельные строки не считаются именем', () => {
    const claims = validClaims({
      given_name: '  ',
      family_name: '',
      name: ' ',
      preferred_username: 'johndoe',
    });
    expect(parse(claims).name).toBe('johndoe');
  });

  it('имя не строкой игнорируется', () => {
    const claims = validClaims({ given_name: 5, family_name: null, name: 'John Doe' });
    expect(parse(claims).name).toBe('John Doe');
  });

  it('слишком длинное имя обрезается до потолка', () => {
    expect(parse(validClaims({ given_name: 'я'.repeat(300) })).name).toHaveLength(129);
  });
});

describe('parseTelegramIdToken — отказы', () => {
  it('не JWT', () => {
    expect(() =>
      parseTelegramIdToken('не.jwt', { clientId: CLIENT_ID, now: NOW }),
    ).toThrow('не похож на JWT');
  });

  it('неизвестный iss', () => {
    expect(() => parse(validClaims({ iss: 'https://evil.example' }))).toThrow('iss');
  });

  it('iss Google не годится', () => {
    expect(() => parse(validClaims({ iss: 'https://accounts.google.com' }))).toThrow(
      'iss',
    );
  });

  it('iss без схемы не принимается — у Telegram он один', () => {
    expect(() => parse(validClaims({ iss: 'oauth.telegram.org' }))).toThrow('iss');
  });

  it('aud строкой не совпадает с client_id', () => {
    expect(() => parse(validClaims({ aud: '111' }))).toThrow('aud');
  });

  it('aud массивом без нашего клиента', () => {
    expect(() => parse(validClaims({ aud: ['111', '222'] }))).toThrow('aud');
  });

  it('aud отсутствует', () => {
    expect(() => parse(without('aud'))).toThrow('aud');
  });

  it('aud числом не принимается — Telegram шлёт строку', () => {
    expect(() => parse(validClaims({ aud: Number(CLIENT_ID) }))).toThrow('aud');
  });

  it('exp в прошлом', () => {
    expect(() =>
      parse(validClaims({ exp: NOW.minus({ minutes: 1 }).toSeconds() })),
    ).toThrow('истёк');
  });

  it('exp равен now — не строго в будущем', () => {
    expect(() => parse(validClaims({ exp: NOW.toSeconds() }))).toThrow('истёк');
  });

  it('exp отсутствует или строкой', () => {
    expect(() => parse(without('exp'))).toThrow('истёк');
    expect(() => parse(validClaims({ exp: '9999999999' }))).toThrow('истёк');
  });

  it('id отсутствует — не просили scope profile', () => {
    expect(() => parse(without('id'))).toThrow('claim id');
  });

  it.each([
    ['нуль', 0],
    ['отрицательный', -5],
    ['дробный', 1.5],
    ['за пределом безопасных целых', 2 ** 53],
    ['строка не из цифр', '12ab'],
    ['пустая строка', ''],
    ['строка слишком длинная', '1'.repeat(17)],
    ['строка нуля', '0'],
    ['null', null],
    ['объект', { id: 1 }],
    ['булево', true],
  ])('id: %s — отказ', (_label, id) => {
    expect(() => parse(validClaims({ id }))).toThrow('claim id');
  });
});
