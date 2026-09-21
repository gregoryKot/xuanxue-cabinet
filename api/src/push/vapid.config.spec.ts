// Чистая функция, без DI и без сети (CLAUDE.md «Тесты») — тот же приём, что
// r2.config.spec.ts.
import type { ConfigService } from '@nestjs/config';
import { readVapidConfig } from './vapid.config';

function fakeConfig(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

const FULL = {
  VAPID_PUBLIC_KEY: 'A'.repeat(87),
  VAPID_PRIVATE_KEY: 'B'.repeat(43),
  VAPID_SUBJECT: 'mailto:school@example.com',
};

describe('readVapidConfig', () => {
  it('полный набор — все три значения как есть', () => {
    expect(readVapidConfig(fakeConfig(FULL))).toEqual({
      publicKey: FULL.VAPID_PUBLIC_KEY,
      privateKey: FULL.VAPID_PRIVATE_KEY,
      subject: FULL.VAPID_SUBJECT,
    });
  });

  it('пустой набор — null, push просто выключен', () => {
    expect(readVapidConfig(fakeConfig({}))).toBeNull();
  });

  it.each(['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'])(
    'половина набора (нет %s) — тоже null',
    (missing) => {
      const values: Record<string, string | undefined> = { ...FULL };
      delete values[missing];
      expect(readVapidConfig(fakeConfig(values))).toBeNull();
    },
  );
});
