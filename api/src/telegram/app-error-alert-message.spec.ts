// Чистая логика, без Mongo и DI (CLAUDE.md «Тесты»).
import type {
  AppErrorAlertContext,
  ClientErrorAlertContext,
} from '../common/app-error-alerts';
import { appErrorAlertMessage, clientErrorAlertMessage } from './app-error-alert-message';

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

function fakeClientContext(
  overrides: Partial<ClientErrorAlertContext> = {},
): ClientErrorAlertContext {
  return { requestId: 'req-7', kind: 'render', path: '/exams', ...overrides };
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

describe('clientErrorAlertMessage', () => {
  it('адрес экрана и код обращения — в тексте', () => {
    const text = clientErrorAlertMessage(fakeClientContext());

    expect(text).toContain('/exams');
    expect(text).toContain('req-7');
    expect(text).toContain('Посмотрите логи Railway');
  });

  // Сбой в браузере и 500-я на том же адресе — разные события, и в кармане у
  // владельца они должны различаться с первого слова.
  it('называет браузер, а не кабинет — иначе не отличить от серверной 500', () => {
    expect(clientErrorAlertMessage(fakeClientContext())).toContain('Сбой в браузере');
    expect(appErrorAlertMessage(fakeContext())).toContain('Сбой в кабинете');
  });

  it('каждый вид сбоя назван по-человечески, без «undefined»', () => {
    const render = clientErrorAlertMessage(fakeClientContext({ kind: 'render' }));
    const unhandled = clientErrorAlertMessage(fakeClientContext({ kind: 'unhandled' }));
    const chunk = clientErrorAlertMessage(fakeClientContext({ kind: 'chunk' }));

    expect(render).toContain('экран не нарисовался');
    expect(unhandled).toContain('вне рендера');
    expect(chunk).toContain('не догрузился код экрана');
    expect(`${render}${unhandled}${chunk}`).not.toContain('undefined');
  });

  it('нет requestId — тот же хвост, что у серверного сообщения', () => {
    const text = clientErrorAlertMessage(fakeClientContext({ requestId: undefined }));

    expect(text).not.toContain('undefined');
    expect(text).toContain('логах Railway');
  });
});
