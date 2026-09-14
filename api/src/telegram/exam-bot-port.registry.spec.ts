// Чистая логика, без Mongo и без Telegram (CLAUDE.md «Тесты»): реестр порта
// до регистрации (ExamsModule не поднят) обязан сказать об этом явной
// ошибкой, а не отдать `undefined` в хендлер бота.
import { ExamBotPortRegistry } from './exam-bot-port.registry';
import { fakeExamBotPort } from './exam-bot.port.test-support';

describe('ExamBotPortRegistry', () => {
  it('порт не зарегистрирован — бросает понятную ошибку', () => {
    expect(() => new ExamBotPortRegistry().get()).toThrow('ExamsModule не поднят');
  });

  it('после регистрации возвращает зарегистрированную реализацию', () => {
    const registry = new ExamBotPortRegistry();
    const impl = fakeExamBotPort();

    registry.set(impl);

    expect(registry.get()).toBe(impl);
  });

  // Состояние живёт в провайдере, а не в модуле: два приложения (а тесты
  // поднимают по приложению на файл) не делят порт между собой.
  it('у двух реестров состояние своё', () => {
    const first = new ExamBotPortRegistry();
    first.set(fakeExamBotPort());

    expect(() => new ExamBotPortRegistry().get()).toThrow();
  });
});
