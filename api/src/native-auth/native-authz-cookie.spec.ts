import {
  NATIVE_AUTHZ_COOKIE,
  buildNativeAuthzCookie,
  nativeAuthzBinding,
  readNativeAuthzCookie,
} from './native-authz-cookie';

const VALUE = 'v'.repeat(43);

describe('cookie привязки native_authz', () => {
  it('атрибуты из профиля и срок попытки', () => {
    expect(buildNativeAuthzCookie(VALUE)).toBe(
      `native_authz=${VALUE}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=900`,
    );
  });

  it('читается только значение нашего формата', () => {
    expect(readNativeAuthzCookie(`session=abc; ${NATIVE_AUTHZ_COOKIE}=${VALUE}`)).toBe(
      VALUE,
    );
    expect(readNativeAuthzCookie(`${NATIVE_AUTHZ_COOKIE}=short`)).toBeNull();
    expect(readNativeAuthzCookie(`${NATIVE_AUTHZ_COOKIE}=`)).toBeNull();
    expect(readNativeAuthzCookie('session=abc')).toBeNull();
    expect(readNativeAuthzCookie(undefined)).toBeNull();
  });

  it('браузер с привязкой сохраняет её и продлевает срок', () => {
    const binding = nativeAuthzBinding(`${NATIVE_AUTHZ_COOKIE}=${VALUE}`);

    expect(binding.value).toBe(VALUE);
    expect(binding.cookie).toBe(buildNativeAuthzCookie(VALUE));
  });

  it('без привязки или с чужим значением — новая случайная', () => {
    const fresh = nativeAuthzBinding(undefined);
    const replaced = nativeAuthzBinding(`${NATIVE_AUTHZ_COOKIE}=bad`);

    expect(fresh.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(replaced.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(replaced.value).not.toBe(fresh.value);
  });
});
