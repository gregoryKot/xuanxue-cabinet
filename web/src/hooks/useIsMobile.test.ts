import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useIsMobile } from './useIsMobile';

function stubMatchMedia(initialMatches: boolean) {
  let changeHandler: ((event: MediaQueryListEvent) => void) | null = null;
  const mql = {
    matches: initialMatches,
    media: '',
    addEventListener: (_type: string, handler: (e: MediaQueryListEvent) => void) => {
      changeHandler = handler;
    },
    removeEventListener: () => {
      changeHandler = null;
    },
  } as unknown as MediaQueryList;
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql));
  return {
    fireChange: (matches: boolean) => {
      changeHandler?.({ matches } as MediaQueryListEvent);
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useIsMobile', () => {
  it('изначально отражает matchMedia.matches', () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it('desktop по умолчанию (matches: false)', () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('меняется при событии change', () => {
    const { fireChange } = stubMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());

    act(() => fireChange(true));

    expect(result.current).toBe(true);
  });
});
