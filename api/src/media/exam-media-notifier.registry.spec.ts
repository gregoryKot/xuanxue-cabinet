// Чистая логика, без Mongo (CLAUDE.md «Тесты»): в отличие от ExamBotPortRegistry
// (exam-bot-port.registry.spec.ts) — не бросает до регистрации, а отдаёт
// `null` (комментарий в exam-media-notifier.registry.ts — почему best-effort).
import { ExamMediaNotifierRegistry } from './exam-media-notifier.registry';
import type { ExamMediaNotifier } from './exam-media-notifier.port';

function fakeNotifier(): ExamMediaNotifier {
  return { notifyVideoLinkAdded: jest.fn().mockResolvedValue(undefined) };
}

describe('ExamMediaNotifierRegistry', () => {
  it('нотификатор не зарегистрирован — getOrNull() отдаёт null, не бросает', () => {
    expect(new ExamMediaNotifierRegistry().getOrNull()).toBeNull();
  });

  it('после регистрации возвращает зарегистрированную реализацию', () => {
    const registry = new ExamMediaNotifierRegistry();
    const impl = fakeNotifier();

    registry.set(impl);

    expect(registry.getOrNull()).toBe(impl);
  });

  // Состояние живёт в провайдере, а не в модуле: два приложения (а тесты
  // поднимают по приложению на файл) не делят реестр между собой.
  it('у двух реестров состояние своё', () => {
    const first = new ExamMediaNotifierRegistry();
    first.set(fakeNotifier());

    expect(new ExamMediaNotifierRegistry().getOrNull()).toBeNull();
  });
});
