// Юнит-тест googleOAuthConfig (google-login-config.ts) — фейковый ConfigService.
import type { ConfigService } from '@nestjs/config';
import { googleOAuthConfig } from './google-login-config';

function fakeConfig(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('googleOAuthConfig', () => {
  it('все три переменные заданы — конфиг с redirectUri из PUBLIC_URL', () => {
    const config = googleOAuthConfig(
      fakeConfig({
        GOOGLE_CLIENT_ID: 'id.apps.googleusercontent.com',
        GOOGLE_CLIENT_SECRET: 'secret',
        PUBLIC_URL: 'https://cabinet.example',
      }),
    );
    expect(config).toEqual({
      clientId: 'id.apps.googleusercontent.com',
      clientSecret: 'secret',
      redirectUri: 'https://cabinet.example/login/google',
      publicUrl: 'https://cabinet.example',
    });
  });

  it.each(['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'PUBLIC_URL'])(
    'без %s — null',
    (missing) => {
      const values: Record<string, string | undefined> = {
        GOOGLE_CLIENT_ID: 'id.apps.googleusercontent.com',
        GOOGLE_CLIENT_SECRET: 'secret',
        PUBLIC_URL: 'https://cabinet.example',
      };
      delete values[missing];
      expect(googleOAuthConfig(fakeConfig(values))).toBeNull();
    },
  );

  it('ничего не задано — null', () => {
    expect(googleOAuthConfig(fakeConfig({}))).toBeNull();
  });
});
