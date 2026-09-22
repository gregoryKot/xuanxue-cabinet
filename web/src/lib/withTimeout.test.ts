// Юнит-тест общего предела ожидания (баг с прода 2026-09-22) — без реального
// setTimeout, фейковые таймеры (CLAUDE.md «Детерминизм»). Три ветки: обычный
// путь, срабатывание предела, и исходный промис, который отвечает ПОЗЖЕ
// предела и не должен ничего перезаписать.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimeoutError, withTimeout } from './withTimeout';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('withTimeout — обычный путь', () => {
  it('промис резолвится раньше предела — отдаёт значение и снимает таймер', async () => {
    const result = withTimeout(Promise.resolve('ok'), 1000, 'вышло время');

    await expect(result).resolves.toBe('ok');
    // Таймер снят при резолве — иначе он всё равно тикнет позже (страховка
    // от утечки таймера, тот же приём, что serviceWorkerReady.test.ts).
    expect(vi.getTimerCount()).toBe(0);
  });

  it('промис отклоняется раньше предела — прокидывает исходную причину, не текст таймаута', async () => {
    const ownError = new Error('своя ошибка');
    const result = withTimeout(Promise.reject(ownError), 1000, 'вышло время');

    await expect(result).rejects.toBe(ownError);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('withTimeout — предел сработал', () => {
  it('промис не отвечает — по истечении предела падает с TimeoutError и переданным текстом', async () => {
    const result = withTimeout(new Promise(() => {}), 1000, 'браузер не ответил');

    // Обработчик отклонения — до продвижения таймера: иначе промис успевает
    // упасть без подписчика между advanceTimersByTimeAsync и await
    // expect(...), и vitest ругается на unhandled rejection (тот же приём,
    // что pushSectionState.test.ts).
    const rejection = expect(result).rejects.toThrow('браузер не ответил');
    await vi.advanceTimersByTimeAsync(1000);
    await rejection;
    await expect(result).rejects.toBeInstanceOf(TimeoutError);
  });

  it('запасной предел короче стандартного учитывается', async () => {
    const result = withTimeout(new Promise(() => {}), 200, 'вышло время');
    const rejection = expect(result).rejects.toThrow('вышло время');

    await vi.advanceTimersByTimeAsync(199);
    await vi.advanceTimersByTimeAsync(1);
    await rejection;
  });
});

describe('withTimeout — поздний ответ после предела', () => {
  it('исходный промис резолвится позже предела — ничего не перезаписывает', async () => {
    let resolveOriginal: (value: string) => void = () => {};
    const original = new Promise<string>((resolve) => {
      resolveOriginal = resolve;
    });

    const rejection = expect(withTimeout(original, 1000, 'вышло время')).rejects.toThrow(
      'вышло время',
    );
    await vi.advanceTimersByTimeAsync(1000);
    await rejection;

    // Поздний резолв исходного промиса (его самого отменить нечем — тот же
    // довод, что у subscribe() в usePushSubscription.ts) не должен ничего
    // сломать: withTimeout уже улажен, второй resolve/reject внутри него не
    // происходит.
    resolveOriginal('поздно, уже не считается');
    await vi.advanceTimersByTimeAsync(0);
  });

  it('исходный промис отклоняется позже предела — ничего не перезаписывает', async () => {
    let rejectOriginal: (reason: unknown) => void = () => {};
    const original = new Promise<string>((_resolve, reject) => {
      rejectOriginal = reject;
    });

    const rejection = expect(withTimeout(original, 1000, 'вышло время')).rejects.toThrow(
      'вышло время',
    );
    await vi.advanceTimersByTimeAsync(1000);
    await rejection;

    // Поздний отказ исходного промиса — тоже не должен породить второе
    // отклонение (settled уже true внутри withTimeout).
    rejectOriginal(new Error('поздний отказ'));
    await vi.advanceTimersByTimeAsync(0);
  });
});
