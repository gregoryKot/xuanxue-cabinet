// Без HTTP и без DI-модуля: контроллер — одна строка поверх readVapidConfig
// (vapid.config.ts, уже покрыт своим тестом), здесь — что он действительно
// подставляет ConfigService и отдаёт null, когда push выключен.
import type { ConfigService } from '@nestjs/config';
import { PushKeyController } from './push-key.controller';

function fakeConfig(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('PushKeyController', () => {
  it('VAPID настроен — отдаёт публичный ключ', () => {
    const controller = new PushKeyController(
      fakeConfig({
        VAPID_PUBLIC_KEY: 'A'.repeat(87),
        VAPID_PRIVATE_KEY: 'B'.repeat(43),
        VAPID_SUBJECT: 'mailto:school@example.com',
      }),
    );

    expect(controller.getPublicKey()).toEqual({ publicKey: 'A'.repeat(87) });
  });

  it('push выключен — null, не ошибка', () => {
    const controller = new PushKeyController(fakeConfig({}));

    expect(controller.getPublicKey()).toEqual({ publicKey: null });
  });
});
