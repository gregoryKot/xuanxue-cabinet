import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCopyText } from './useCopyText';

// eslint-disable-next-line @typescript-eslint/unbound-method -- сохраняем ссылку только для restore в afterEach, `this` нативному DOM-методу не нужен
const originalExecCommand = document.execCommand;

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.execCommand = originalExecCommand;
});

describe('useCopyText', () => {
  it('clipboard API доступен — вызывает writeText, copied=true', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const { result } = renderHook(() => useCopyText());

    await act(async () => {
      await result.current.copy('текст доставки');
    });

    expect(writeText).toHaveBeenCalledWith('текст доставки');
    expect(result.current.copied).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('clipboard API бросает ошибку — резерв через execCommand, copied=true', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand;
    const { result } = renderHook(() => useCopyText());

    await act(async () => {
      await result.current.copy('текст доставки');
    });

    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(result.current.copied).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('execCommand тоже не сработал — честная ошибка, copied=false (pr-k3-fixes.md п.12)', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    document.execCommand = vi.fn().mockReturnValue(false);
    const { result } = renderHook(() => useCopyText());

    await act(async () => {
      await result.current.copy('текст доставки');
    });

    expect(result.current.copied).toBe(false);
    expect(result.current.error).toBe(
      'Не удалось скопировать — выделите текст и скопируйте вручную.',
    );
  });

  it('copied сбрасывается через таймаут', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const { result } = renderHook(() => useCopyText());

    await act(async () => {
      await result.current.copy('текст');
    });
    expect(result.current.copied).toBe(true);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.copied).toBe(false);
  });

  it('размонтирование во время таймера — не роняет тест (таймер снимается в useEffect)', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const { result, unmount } = renderHook(() => useCopyText());

    await act(async () => {
      await result.current.copy('текст');
    });
    unmount();

    // Проверяется именно это: таймер, доживший до размонтирования, не
    // трогает состояние снятого хука. Раньше проверкой был зелёный прогон —
    // гейт check-test-assertions.mjs такого не пропускает (аудит 2026-09-22).
    expect(() =>
      act(() => {
        vi.advanceTimersByTime(2000);
      }),
    ).not.toThrow();
  });
});
