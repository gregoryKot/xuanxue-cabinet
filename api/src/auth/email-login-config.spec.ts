// Юнит-тест на фейковом ConfigService — три переменные разом (ADR-0029,
// ADR-0059), без Nest и без сети (CLAUDE.md «Тесты»).
import type { ConfigService } from '@nestjs/config';
import { emailLoginPublicUrl } from './email-login-config';

const AVAILABLE = {
  RESEND_API_KEY: 're_test',
  MAIL_FROM: 'Школа <school@xuanxue.su>',
  PUBLIC_URL: 'https://xuanxue.su',
};

function fakeConfig(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('emailLoginPublicUrl', () => {
  it('все три переменные заданы — возвращает PUBLIC_URL', () => {
    expect(emailLoginPublicUrl(fakeConfig(AVAILABLE))).toBe('https://xuanxue.su');
  });

  it.each(['RESEND_API_KEY', 'MAIL_FROM', 'PUBLIC_URL'])(
    'нет %s — null',
    (missingKey) => {
      const config = fakeConfig({ ...AVAILABLE, [missingKey]: undefined });

      expect(emailLoginPublicUrl(config)).toBeNull();
    },
  );
});
