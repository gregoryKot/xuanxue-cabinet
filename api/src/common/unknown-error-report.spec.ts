// Юнит без Mongo и без DI (CLAUDE.md «Тесты»): порты — простые типизированные
// заглушки, тем же приёмом, что buildAppErrorAlerts в
// domain-exception.filter.spec.ts.
import type { Logger } from 'nestjs-pino';
import type { AppErrorAlertContext, AppErrorAlerts } from './app-error-alerts';
import type { AppErrorJournal, AppErrorJournalEntry } from './app-error-journal';
import { reportUnknownError, type UnknownErrorContext } from './unknown-error-report';

function buildLogger(): { logger: Logger; errorCalls: string[] } {
  const errorCalls: string[] = [];
  const error = (message: string): void => {
    errorCalls.push(message);
  };
  return { logger: { error } as unknown as Logger, errorCalls };
}

function buildAlerts(rejectWith?: Error): {
  alerts: AppErrorAlerts;
  calls: AppErrorAlertContext[];
} {
  const calls: AppErrorAlertContext[] = [];
  const notifyServerError = (context: AppErrorAlertContext): Promise<void> => {
    calls.push(context);
    return rejectWith ? Promise.reject(rejectWith) : Promise.resolve();
  };
  const notifyClientError = (): Promise<void> => Promise.resolve();
  return { alerts: { notifyServerError, notifyClientError }, calls };
}

function buildJournal(rejectWith?: Error): {
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

function context(overrides: Partial<UnknownErrorContext> = {}): UnknownErrorContext {
  return {
    request: { method: 'GET', url: '/api/x' },
    requestId: 'req-1',
    exception: new Error('boom'),
    ...overrides,
  };
}

describe('reportUnknownError', () => {
  it('без журнала и без алёртов — не бросает', () => {
    const { logger } = buildLogger();

    expect(() => reportUnknownError({ logger }, context())).not.toThrow();
  });

  it('алёрт отверг промис — своя строка в лог, исключение не улетает', async () => {
    const { logger, errorCalls } = buildLogger();
    const { alerts } = buildAlerts(new Error('telegram недоступен'));

    reportUnknownError({ logger, alerts }, context());
    await Promise.resolve();

    expect(errorCalls).toHaveLength(1);
    expect(errorCalls[0]).toContain('app_error alert');
    expect(errorCalls[0]).toContain('req-1');
  });

  it('журнал отверг промис — своя строка в лог, отдельно от алёрта', async () => {
    const { logger, errorCalls } = buildLogger();
    const { journal } = buildJournal(new Error('mongo недоступна'));

    reportUnknownError({ logger, journal }, context());
    await Promise.resolve();

    expect(errorCalls).toHaveLength(1);
    expect(errorCalls[0]).toContain('app_error journal');
    expect(errorCalls[0]).toContain('req-1');
  });

  it('оба порта отвергли промис — по своей строке в лог на каждый', async () => {
    const { logger, errorCalls } = buildLogger();
    const { alerts } = buildAlerts(new Error('telegram недоступен'));
    const { journal } = buildJournal(new Error('mongo недоступна'));

    reportUnknownError({ logger, alerts, journal }, context());
    await Promise.resolve();

    expect(errorCalls).toHaveLength(2);
    expect(errorCalls.some((line) => line.includes('app_error alert'))).toBe(true);
    expect(errorCalls.some((line) => line.includes('app_error journal'))).toBe(true);
  });

  it('нет кода обращения — в строке лога прочерк, не «undefined»', async () => {
    const { logger, errorCalls } = buildLogger();
    const { journal } = buildJournal(new Error('mongo недоступна'));

    reportUnknownError({ logger, journal }, context({ requestId: undefined }));
    await Promise.resolve();

    expect(errorCalls[0]).toContain('requestId=-');
    expect(errorCalls[0]).not.toContain('undefined)');
  });

  it('синтетический запрос без method/url — цель "-"/"-"', async () => {
    const { alerts, calls } = buildAlerts();

    reportUnknownError(
      { logger: buildLogger().logger, alerts },
      context({ request: {} }),
    );
    await Promise.resolve();

    expect(calls[0]).toMatchObject({ method: '-', path: '-' });
  });

  it('путь без query отрезан на пути в порты', async () => {
    const { alerts, calls } = buildAlerts();
    const { journal, calls: journalCalls } = buildJournal();

    reportUnknownError(
      { logger: buildLogger().logger, alerts, journal },
      context({ request: { method: 'GET', url: '/exams?token=secret' } }),
    );
    await Promise.resolve();

    expect(calls[0]).toMatchObject({ path: '/exams' });
    expect(journalCalls[0]).toMatchObject({ path: '/exams' });
  });
});
