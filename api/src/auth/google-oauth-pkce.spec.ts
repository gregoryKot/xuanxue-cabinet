// Юнит-тест примитивов PKCE (google-oauth-pkce.ts) — чистые функции, без DI.
import {
  codeChallenge,
  randomUrlSafe,
  timingSafeEqualStrings,
} from './google-oauth-pkce';

describe('randomUrlSafe', () => {
  it('base64url без выравнивания, две генерации не совпадают', () => {
    const a = randomUrlSafe(32);
    const b = randomUrlSafe(32);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a).not.toContain('=');
  });

  it('43 знака на 32 байта — формат GOOGLE_OAUTH_STATE_RE', () => {
    expect(randomUrlSafe(32)).toHaveLength(43);
  });
});

describe('codeChallenge', () => {
  it('детерминированный SHA256(verifier) в base64url — RFC 7636 §B пример', () => {
    // Пример из RFC 7636 приложение B: code_verifier → code_challenge.
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    expect(codeChallenge(verifier)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('разные verifier дают разные challenge', () => {
    expect(codeChallenge('a')).not.toBe(codeChallenge('b'));
  });
});

describe('timingSafeEqualStrings', () => {
  it('совпадающие строки — true', () => {
    expect(timingSafeEqualStrings('abc', 'abc')).toBe(true);
  });

  it('разные строки одной длины — false', () => {
    expect(timingSafeEqualStrings('abc', 'abd')).toBe(false);
  });

  it('разная длина — false без исключения', () => {
    expect(timingSafeEqualStrings('abc', 'abcd')).toBe(false);
  });
});
