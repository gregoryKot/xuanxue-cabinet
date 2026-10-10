import {
  isNativeSecretFormat,
  newNativeSecret,
  s256Challenge,
  sha256Hex,
} from './native-secrets';

describe('native-secrets', () => {
  it('N02: S256 даёт вектор RFC 7636 из профиля', () => {
    expect(s256Challenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('секрет — 43 знака base64url, и каждый новый другой', () => {
    const secrets = Array.from({ length: 50 }, () => newNativeSecret());

    expect(secrets.every((secret) => /^[A-Za-z0-9_-]{43}$/.test(secret))).toBe(true);
    expect(new Set(secrets).size).toBe(secrets.length);
  });

  it('формат принимает свой секрет и отвергает чужое', () => {
    expect(isNativeSecretFormat(newNativeSecret())).toBe(true);
    expect(isNativeSecretFormat('')).toBe(false);
    expect(isNativeSecretFormat('a'.repeat(42))).toBe(false);
    expect(isNativeSecretFormat('a'.repeat(44))).toBe(false);
    expect(isNativeSecretFormat(`${'a'.repeat(42)}=`)).toBe(false);
    expect(isNativeSecretFormat(`${'a'.repeat(42)}\n`)).toBe(false);
  });

  it('sha256Hex — 64 шестнадцатеричных знака, известный вектор', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
