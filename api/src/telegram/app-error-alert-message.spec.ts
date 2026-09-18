// Чистая логика, без Mongo и DI (CLAUDE.md «Тесты»).
import type { AppErrorAlertContext } from '../common/app-error-alerts';
import { appErrorAlertMessage } from './app-error-alert-message';

function fakeContext(
  overrides: Partial<AppErrorAlertContext> = {},
): AppErrorAlertContext {
  return {
    requestId: 'req-42',
    method: 'POST',
    path: '/api/lessons/507f1f77bcf86cd799439011/recording',
    message: "TypeError: Cannot read properties of undefined (reading 'id')",
    ...overrides,
  };
}

describe('appErrorAlertMessage', () => {
  it('метод, путь и код обращения — в тексте', () => {
    const text = appErrorAlertMessage(fakeContext());

    expect(text).toContain('POST');
    expect(text).toContain('/api/lessons/507f1f77bcf86cd799439011/recording');
    expect(text).toContain('req-42');
  });

  it('текста исключения в сообщении нет', () => {
    const text = appErrorAlertMessage(fakeContext());

    expect(text).not.toContain('TypeError');
    expect(text).not.toContain('undefined');
  });

  it('говорит, что делать — посмотреть логи Railway по коду обращения', () => {
    const text = appErrorAlertMessage(fakeContext());

    expect(text).toContain('Посмотрите логи Railway');
  });

  it('нет requestId — сообщение без «код обращения», не «undefined»', () => {
    const text = appErrorAlertMessage(fakeContext({ requestId: undefined }));

    expect(text).not.toContain('undefined');
    expect(text).toContain('логах Railway');
  });
});
