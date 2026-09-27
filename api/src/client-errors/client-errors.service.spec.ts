// Юнит без Mongo и без DI (CLAUDE.md «Тесты»): порты — простые типизированные
// заглушки, не jest.fn() (тот же приём, что buildAppErrorAlerts в
// domain-exception.filter.spec.ts); Logger.prototype.error — jest.spyOn
// (тот же приём, что telegram-app-error-alerts.spec.ts).
import { Logger } from '@nestjs/common';
import { CLIENT_ERROR_LIMITS, type ReportClientErrorInput } from '@xuanxue/shared';
import type { AppErrorAlerts, ClientErrorAlertContext } from '../common/app-error-alerts';
import type { AppErrorJournal, AppErrorJournalEntry } from '../common/app-error-journal';
import { ClientErrorsService } from './client-errors.service';

function fakeAlerts(rejectWith?: Error): {
  alerts: AppErrorAlerts;
  calls: ClientErrorAlertContext[];
} {
  const calls: ClientErrorAlertContext[] = [];
  const notifyClientError = (context: ClientErrorAlertContext): Promise<void> => {
    calls.push(context);
    return rejectWith ? Promise.reject(rejectWith) : Promise.resolve();
  };
  // notifyServerError ClientErrorsService не зовёт никогда — заглушка нужна
  // только чтобы удовлетворить интерфейс AppErrorAlerts целиком.
  const notifyServerError = (): Promise<void> => Promise.resolve();
  return { alerts: { notifyServerError, notifyClientError }, calls };
}

function fakeJournal(rejectWith?: Error): {
  journal: AppErrorJournal;
  calls: AppErrorJournalEntry[];
} {
  const calls: AppErrorJournalEntry[] = [];
  const record = (entry: AppErrorJournalEntry): Promise<void> => {
    calls.push(entry);
    return rejectWith ? Promise.reject(rejectWith) : Promise.resolve();
  };
  return { journal: { record }, calls };
}

function input(overrides: Partial<ReportClientErrorInput> = {}): ReportClientErrorInput {
  return {
    kind: 'render',
    message: 'TypeError: x is undefined',
    path: '/exams',
    ...overrides,
  };
}

describe('ClientErrorsService.report', () => {
  it('query из path вырезан и в логе, и в порте', () => {
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { alerts, calls } = fakeAlerts();
    const service = new ClientErrorsService(alerts);

    service.report(input({ path: '/exams?token=secret' }), 'req-1');

    expect(calls[0]).toMatchObject({ path: '/exams' });
    const [fields] = error.mock.calls[0] as [Record<string, unknown>, string];
    expect(fields.path).toBe('/exams');
    error.mockRestore();
  });

  it('слишком длинные message и path обрезаны по CLIENT_ERROR_LIMITS', () => {
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { alerts, calls } = fakeAlerts();
    const service = new ClientErrorsService(alerts);
    const longMessage = 'x'.repeat(CLIENT_ERROR_LIMITS.fieldHardMax);
    const longPath = `/${'a'.repeat(CLIENT_ERROR_LIMITS.fieldHardMax)}`;

    service.report(input({ message: longMessage, path: longPath }), 'req-2');

    expect(calls[0]?.path).toHaveLength(CLIENT_ERROR_LIMITS.path);
    const [fields] = error.mock.calls[0] as [Record<string, unknown>, string];
    expect(fields.path).toHaveLength(CLIENT_ERROR_LIMITS.path);
    expect(fields.errorText).toHaveLength(CLIENT_ERROR_LIMITS.message);
    error.mockRestore();
  });

  // Регрессия 23–26.09.2026 (requestId 5addec59…, ed7b3bac…, 9e47b860…,
  // 9a5ef539…): текст ошибки лежал в `message`, и Railway его затёр —
  // алёрт приходил, а причину найти было негде (logging.module.ts).
  it('текст ошибки в логе — в errorText, не в зарезервированном message', () => {
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const service = new ClientErrorsService(fakeAlerts().alerts);

    service.report(input({ message: 'TypeError: x is undefined' }), 'req-5');

    const [fields] = error.mock.calls[0] as [Record<string, unknown>, string];
    expect(fields.errorText).toBe('TypeError: x is undefined');
    expect(fields).not.toHaveProperty('message');
    error.mockRestore();
  });

  it('в порт уходят только requestId/kind/path — без текста сообщения', () => {
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { alerts, calls } = fakeAlerts();
    const service = new ClientErrorsService(alerts);

    service.report(input({ message: 'секретная подробность стека' }), 'req-3');

    expect(calls[0]).toEqual({ requestId: 'req-3', kind: 'render', path: '/exams' });
    error.mockRestore();
  });

  it("kind: 'chunk' — строка в логе есть, порт не вызван", () => {
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { alerts, calls } = fakeAlerts();
    const service = new ClientErrorsService(alerts);

    service.report(input({ kind: 'chunk' }), 'req-4');

    expect(calls).toHaveLength(0);
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it("kind: 'render' — порт вызван", () => {
    const { alerts, calls } = fakeAlerts();
    const service = new ClientErrorsService(alerts);

    service.report(input({ kind: 'render' }), 'req-5');

    expect(calls).toHaveLength(1);
  });

  it("kind: 'unhandled' — порт вызван", () => {
    const { alerts, calls } = fakeAlerts();
    const service = new ClientErrorsService(alerts);

    service.report(input({ kind: 'unhandled' }), 'req-6');

    expect(calls).toHaveLength(1);
  });

  it('порта нет (@Optional() ничего не внедрил) — не падает, лог есть', () => {
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const service = new ClientErrorsService();

    expect(() => service.report(input(), 'req-7')).not.toThrow();

    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it('порт отверг промис — исключение не улетает наружу, в логе есть строка об этом', async () => {
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { alerts } = fakeAlerts(new Error('telegram недоступен'));
    const service = new ClientErrorsService(alerts);

    expect(() => service.report(input(), 'req-8')).not.toThrow();
    // Один microtask-тик — дать отработать .catch() у fire-and-forget вызова
    // (report не ждёт ответ порта, как notifyAppError в DomainExceptionFilter).
    await Promise.resolve();

    expect(error).toHaveBeenCalledTimes(2);
    expect(String(error.mock.calls[1]?.[0])).toContain('req-8');
    expect(String(error.mock.calls[1]?.[0])).toContain('не удалось уведомить');
    error.mockRestore();
  });

  // Тот же отказ, но кода обращения нет: в строке лога должен стоять прочерк,
  // а не слово «undefined» — по такому «коду» в логах Railway не ищут.
  it('порт отверг промис без кода обращения — в логе прочерк, не «undefined»', async () => {
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { alerts } = fakeAlerts(new Error('telegram недоступен'));
    const service = new ClientErrorsService(alerts);

    service.report(input(), undefined);
    await Promise.resolve();

    expect(String(error.mock.calls[1]?.[0])).toContain('requestId=-');
    expect(String(error.mock.calls[1]?.[0])).not.toContain('undefined');
    error.mockRestore();
  });
});

// Журнал сбоев (ADR-0132) — пишет ВСЕ виды, включая 'chunk' (в отличие от
// алёрта в Telegram, который на 'chunk' молчит, SILENT_KINDS выше).
describe('ClientErrorsService.report — журнал сбоев (AppErrorJournal)', () => {
  it("kind: 'chunk' — тоже пишется в журнал, хотя алёрт в Telegram на него не уходит", () => {
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { alerts, calls: alertCalls } = fakeAlerts();
    const { journal, calls } = fakeJournal();
    const service = new ClientErrorsService(alerts, journal);

    service.report(input({ kind: 'chunk' }), 'req-9', 'Mozilla/5.0');

    expect(alertCalls).toHaveLength(0);
    expect(calls).toEqual([
      {
        requestId: 'req-9',
        source: 'browser',
        kind: 'chunk',
        path: '/exams',
        text: 'TypeError: x is undefined',
        userAgent: 'Mozilla/5.0',
      },
    ]);
    error.mockRestore();
  });

  it('query из path вырезан в журнале, тем же путём, что в логе и в алёрте', () => {
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { alerts } = fakeAlerts();
    const { journal, calls } = fakeJournal();
    const service = new ClientErrorsService(alerts, journal);

    service.report(input({ path: '/exams?token=secret' }), 'req-10');

    expect(calls[0]?.path).toBe('/exams');
    error.mockRestore();
  });

  it('журнал отверг промис — исключение не улетает наружу, в логе есть строка об этом', async () => {
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { alerts } = fakeAlerts();
    const { journal } = fakeJournal(new Error('mongo недоступна'));
    const service = new ClientErrorsService(alerts, journal);

    expect(() => service.report(input(), 'req-11')).not.toThrow();
    await Promise.resolve();

    expect(
      error.mock.calls.some((call) => String(call[0]).includes('app_error journal')),
    ).toBe(true);
    error.mockRestore();
  });

  it('журнала нет (@Optional() ничего не внедрил) — не падает', () => {
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { alerts } = fakeAlerts();
    const service = new ClientErrorsService(alerts);

    expect(() => service.report(input(), 'req-12')).not.toThrow();
    error.mockRestore();
  });
});
