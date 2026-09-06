// ADR-0012: подпись/проверка HS256 вручную. Ветки — валидный токен, битая
// подпись, протухший, чужой секрет, испорченная структура (CLAUDE.md).
import { createHmac } from 'crypto';
import { DateTime } from 'luxon';
import { SESSION_MAX_AGE_DAYS, signSession, verifySession } from './session-token';

const SECRET = 'a'.repeat(32);
const NOW = DateTime.fromISO('2026-09-05T12:00:00Z', { setZone: true });

describe('signSession/verifySession', () => {
  it('валидный токен проходит проверку тем же секретом', () => {
    const token = signSession({ userId: 'u1', issuedAt: NOW }, SECRET);
    const payload = verifySession(token, SECRET, NOW);
    expect(payload).toMatchObject({ sub: 'u1' });
  });

  it('exp выставлен на SESSION_MAX_AGE_DAYS от issuedAt', () => {
    const token = signSession({ userId: 'u1', issuedAt: NOW }, SECRET);
    const payload = verifySession(token, SECRET, NOW);
    const expectedExp = Math.floor(NOW.toSeconds()) + SESSION_MAX_AGE_DAYS * 86_400;
    expect(payload?.exp).toBe(expectedExp);
  });

  it('битая подпись — null', () => {
    const token = signSession({ userId: 'u1', issuedAt: NOW }, SECRET);
    const [header, payload] = token.split('.');
    const tampered = `${header}.${payload}.${'x'.repeat(43)}`;
    expect(verifySession(tampered, SECRET, NOW)).toBeNull();
  });

  it('чужой секрет — null', () => {
    const token = signSession({ userId: 'u1', issuedAt: NOW }, SECRET);
    expect(verifySession(token, 'b'.repeat(32), NOW)).toBeNull();
  });

  it('протухший токен — null', () => {
    const token = signSession({ userId: 'u1', issuedAt: NOW }, SECRET);
    const later = NOW.plus({ days: SESSION_MAX_AGE_DAYS, seconds: 1 });
    expect(verifySession(token, SECRET, later)).toBeNull();
  });

  it('токен на грани — валиден за секунду до exp, невалиден в момент exp', () => {
    const token = signSession({ userId: 'u1', issuedAt: NOW }, SECRET);
    const almostExpired = NOW.plus({ days: SESSION_MAX_AGE_DAYS, seconds: -1 });
    const atExp = NOW.plus({ days: SESSION_MAX_AGE_DAYS });
    expect(verifySession(token, SECRET, almostExpired)).not.toBeNull();
    expect(verifySession(token, SECRET, atExp)).toBeNull();
  });

  it('испорченная структура (не 3 части через точку) — null', () => {
    expect(verifySession('только-одна-часть', SECRET, NOW)).toBeNull();
    expect(verifySession('a.b.c.d', SECRET, NOW)).toBeNull();
    expect(verifySession('', SECRET, NOW)).toBeNull();
  });

  it('payload не JSON, но подпись верна секрету — null, а не исключение', () => {
    const badPayload = Buffer.from('не json').toString('base64url');
    const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url');
    const data = `${header}.${badPayload}`;
    // Подписываем сами тем же секретом и алгоритмом, что signSession/
    // verifySession, — проверяем именно отказ по разбору payload, а не по
    // подписи (иначе тест не отличался бы от «битой подписи» выше).
    const signature = createHmac('sha256', SECRET).update(data).digest('base64url');
    expect(verifySession(`${data}.${signature}`, SECRET, NOW)).toBeNull();
  });

  it('payload — валидный JSON, но не объект (null) — null, а не TypeError на .sub', () => {
    const token = signPayload('null');
    expect(verifySession(token, SECRET, NOW)).toBeNull();
  });

  it('payload без iat — null (иначе shouldRenew получил бы NaN из iat)', () => {
    const token = signPayload(JSON.stringify({ sub: 'u1', exp: 9_999_999_999 }));
    expect(verifySession(token, SECRET, NOW)).toBeNull();
  });

  it('exp = 1e400 (переполнение в Infinity при разборе JSON) — null, не вечный токен', () => {
    const token = signPayload('{"sub":"u1","iat":1,"exp":1e400}');
    expect(verifySession(token, SECRET, NOW)).toBeNull();
  });
});

/** Подписывает сырую строку payload напрямую (без прохода через
 * `signSession`) — нужно, чтобы протолкнуть значения, которые
 * `SessionPayload` не разрешает по типам (`null`, отсутствующий `iat`,
 * `exp` за пределами `number`), но подпись при этом была верной. */
function signPayload(payloadJson: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url');
  const payload = Buffer.from(payloadJson).toString('base64url');
  const data = `${header}.${payload}`;
  const signature = createHmac('sha256', SECRET).update(data).digest('base64url');
  return `${data}.${signature}`;
}
