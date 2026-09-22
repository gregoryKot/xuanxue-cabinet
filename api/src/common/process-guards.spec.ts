// Регрессия на аудит 2026-09-21 (HIGH): main.ts не ловил unhandledRejection
// и uncaughtException — один необработанный reject валил единственный
// инстанс на Railway. Фейковый эмиттер вместо настоящего `process` — иначе
// тест либо реально роняет процесс jest, либо мокает глобальный process
// целиком (хрупко и делит состояние между тестами).
import { EventEmitter } from 'events';
import { installProcessGuards, type ErrorLogger } from './process-guards';

function buildLogger(): {
  logger: ErrorLogger;
  errorCalls: Array<{ message: string; stack?: string }>;
} {
  const errorCalls: Array<{ message: string; stack?: string }> = [];
  const error = (message: string, stack?: string): void => {
    errorCalls.push({ message, stack });
  };
  return { logger: { error }, errorCalls };
}

describe('installProcessGuards', () => {
  it('unhandledRejection: error-лог со стеком, onFatal не зовётся — процесс живёт дальше', () => {
    const target = new EventEmitter();
    const { logger, errorCalls } = buildLogger();
    let fatalCalled = false;

    installProcessGuards(target, logger, () => {
      fatalCalled = true;
    });
    target.emit('unhandledRejection', new Error('reject без catch'));

    expect(errorCalls).toHaveLength(1);
    expect(errorCalls[0]?.message).toContain('process.unhandledRejection');
    expect(errorCalls[0]?.message).toContain('reject без catch');
    expect(errorCalls[0]?.stack).toBeDefined();
    expect(fatalCalled).toBe(false);
  });

  it('unhandledRejection с не-Error значением (строка) — не падает форматированием', () => {
    const target = new EventEmitter();
    const { logger, errorCalls } = buildLogger();

    installProcessGuards(target, logger, () => {});
    target.emit('unhandledRejection', 'отказано без причины');

    expect(errorCalls[0]?.message).toContain('отказано без причины');
    expect(errorCalls[0]?.stack).toBeUndefined();
  });

  it('uncaughtException: error-лог со стеком и onFatal() — состояние процесса недостоверно, Railway перезапустит', () => {
    const target = new EventEmitter();
    const { logger, errorCalls } = buildLogger();
    let fatalCalled = false;

    installProcessGuards(target, logger, () => {
      fatalCalled = true;
    });
    target.emit('uncaughtException', new Error('TypeError: x is undefined'));

    expect(errorCalls).toHaveLength(1);
    expect(errorCalls[0]?.message).toContain('process.uncaughtException');
    expect(errorCalls[0]?.message).toContain('TypeError: x is undefined');
    expect(fatalCalled).toBe(true);
  });
});
