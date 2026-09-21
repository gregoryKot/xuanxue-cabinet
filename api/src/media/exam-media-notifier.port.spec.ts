// Чистая логика, без Mongo и без Telegram (CLAUDE.md «Тесты»): в отличие от
// ExamBotPortRegistry этот реестр обязан вернуть `null` без исключения — бот
// может не подняться вовсе (нет TELEGRAM_BOT_TOKEN), а POST /media/link
// обязан отработать и тогда (комментарий в exam-media-notifier.port.ts).
import {
  ExamMediaNotifierRegistry,
  type ExamMediaNotifierPort,
} from './exam-media-notifier.port';

function fakePort(): ExamMediaNotifierPort {
  return { notifyLinkAttached: jest.fn().mockResolvedValue(undefined) };
}

describe('ExamMediaNotifierRegistry', () => {
  it('порт не зарегистрирован — null, не исключение', () => {
    expect(new ExamMediaNotifierRegistry().get()).toBeNull();
  });

  it('после регистрации возвращает зарегистрированную реализацию', () => {
    const registry = new ExamMediaNotifierRegistry();
    const impl = fakePort();

    registry.set(impl);

    expect(registry.get()).toBe(impl);
  });

  // Состояние живёт в провайдере, а не в модуле: два приложения (тесты
  // поднимают по приложению на файл) не делят порт между собой — тот же
  // инвариант, что у ExamBotPortRegistry, его комментарий-шапка.
  it('у двух реестров состояние своё', () => {
    const first = new ExamMediaNotifierRegistry();
    first.set(fakePort());

    expect(new ExamMediaNotifierRegistry().get()).toBeNull();
  });
});
