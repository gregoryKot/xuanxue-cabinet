// Чистая логика, без Mongo и без Telegram (CLAUDE.md «Тесты»): реестр порта
// до регистрации (TelegramModule не поднят) обязан сказать об этом явной
// ошибкой, а не отдать `undefined` сервису. Зеркало
// exam-bot-port.registry.spec.ts (api/src/telegram/).
import { ExamVideoDeliveryRegistry } from './exam-video-delivery.registry';
import type { ExamVideoDeliveryPort } from './exam-video-delivery.port';

function fakePort(): ExamVideoDeliveryPort {
  return {
    resolveChatId: () => Promise.resolve(null),
    sendVideo: () => Promise.resolve(true),
  };
}

describe('ExamVideoDeliveryRegistry', () => {
  it('порт не зарегистрирован — бросает понятную ошибку', () => {
    expect(() => new ExamVideoDeliveryRegistry().get()).toThrow(
      'TelegramModule не поднят',
    );
  });

  it('после регистрации возвращает зарегистрированную реализацию', () => {
    const registry = new ExamVideoDeliveryRegistry();
    const impl = fakePort();

    registry.set(impl);

    expect(registry.get()).toBe(impl);
  });

  // Состояние живёт в провайдере, а не в модуле: два приложения (а тесты
  // поднимают по приложению на файл) не делят порт между собой.
  it('у двух реестров состояние своё', () => {
    const first = new ExamVideoDeliveryRegistry();
    first.set(fakePort());

    expect(() => new ExamVideoDeliveryRegistry().get()).toThrow();
  });
});
