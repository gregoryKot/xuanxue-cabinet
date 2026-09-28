// Юнит-тест адреса Google OAuth (google-auth-url.ts) — чистая функция.
import { buildGoogleAuthUrl } from './google-auth-url';
import type { GoogleOAuthConfig } from './google-login-config';

const CONFIG: GoogleOAuthConfig = {
  clientId: 'abc.apps.googleusercontent.com',
  clientSecret: 'secret',
  redirectUri: 'https://cabinet.example/login/google',
  publicUrl: 'https://cabinet.example',
};

describe('buildGoogleAuthUrl', () => {
  it('собирает все обязательные параметры PKCE + S256 + select_account', () => {
    const url = new URL(
      buildGoogleAuthUrl(CONFIG, { state: 'st', nonce: 'no', challenge: 'ch' }),
    );

    expect(url.origin + url.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    expect(url.searchParams.get('client_id')).toBe(CONFIG.clientId);
    expect(url.searchParams.get('redirect_uri')).toBe(CONFIG.redirectUri);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('state')).toBe('st');
    expect(url.searchParams.get('nonce')).toBe('no');
    expect(url.searchParams.get('code_challenge')).toBe('ch');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('prompt')).toBe('select_account');
  });
});
