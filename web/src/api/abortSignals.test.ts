// Тест combineAbortSignals (аудит 2026-09-21): проверяем оба пути — родной
// AbortSignal.any (есть в этом окружении по умолчанию) и ручной фолбэк для
// Safari < 17.4, которого требует задание, — подменой самого статического
// метода, а не заменой всего глобального AbortSignal (иначе AbortController
// в фолбэк-ветке создавал бы сигналы не того класса, на который подменена
// проверка).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { combineAbortSignals } from './abortSignals';

describe.each([
  { name: 'AbortSignal.any доступен (обычный браузер)', withNativeAny: true },
  { name: 'AbortSignal.any недоступен (Safari < 17.4)', withNativeAny: false },
])('combineAbortSignals — $name', ({ withNativeAny }) => {
  // Дескриптор, не голую ссылку на метод: `AbortSignal.any` как значение —
  // unbound method для eslint (typescript-eslint/unbound-method), а нам и не
  // нужен вызов — только вернуть статику как была.
  const originalAnyDescriptor = Object.getOwnPropertyDescriptor(AbortSignal, 'any');

  beforeEach(() => {
    if (!withNativeAny) {
      Object.defineProperty(AbortSignal, 'any', { value: undefined, configurable: true });
    }
  });

  afterEach(() => {
    if (originalAnyDescriptor) {
      Object.defineProperty(AbortSignal, 'any', originalAnyDescriptor);
    }
    vi.useRealTimers();
  });

  it('не отменён, пока не отменён ни один из входных сигналов', () => {
    const a = new AbortController();
    const b = new AbortController();

    const combined = combineAbortSignals([a.signal, b.signal]);

    expect(combined.aborted).toBe(false);
  });

  it('отменяется, когда истекает таймер одного из входных сигналов (фейковые таймеры)', () => {
    vi.useFakeTimers();
    const timerController = new AbortController();
    const callerController = new AbortController();
    setTimeout(() => timerController.abort('таймаут'), 1000);

    const combined = combineAbortSignals([
      timerController.signal,
      callerController.signal,
    ]);
    expect(combined.aborted).toBe(false);

    vi.advanceTimersByTime(1000);

    expect(combined.aborted).toBe(true);
    expect(combined.reason).toBe('таймаут');
  });

  it('отменяется, когда вызывающий отменяет свой сигнал раньше таймера', () => {
    vi.useFakeTimers();
    const timerController = new AbortController();
    const callerController = new AbortController();
    setTimeout(() => timerController.abort('таймаут'), 30_000);

    const combined = combineAbortSignals([
      timerController.signal,
      callerController.signal,
    ]);
    callerController.abort('отменено вызывающим');

    expect(combined.aborted).toBe(true);
    expect(combined.reason).toBe('отменено вызывающим');
  });

  it('уже отменённый входной сигнал даёт сразу отменённый результат', () => {
    const already = new AbortController();
    already.abort('уже отменён');
    const other = new AbortController();

    const combined = combineAbortSignals([already.signal, other.signal]);

    expect(combined.aborted).toBe(true);
    expect(combined.reason).toBe('уже отменён');
  });
});
