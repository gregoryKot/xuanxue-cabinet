// Тесты обязательного хука useHistorySheet (CLAUDE.md: любой fullscreen-лист
// обязан закрываться по «Назад» браузера, а не уводить из кабинета — задокументированный
// класс багов двойного закрытия при конфликте history.pushState с React Router).
import { act, render, renderHook } from '@testing-library/react';
import { useEffect, useState, type ReactNode } from 'react';
import {
  MemoryRouter,
  useLocation,
  useNavigate,
  type Location,
  type NavigateFunction,
} from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { useHistorySheet } from './useHistorySheet';

interface SheetState {
  __sheetId?: string;
}

function sheetState(location: Location): SheetState | undefined {
  return location.state as SheetState | undefined;
}

interface Snapshot {
  nav: NavigateFunction | null;
  loc: Location | null;
}

function makeSnapshot(): Snapshot {
  return { nav: null, loc: null };
}

// NavSpy рендерится внутри того же MemoryRouter, что и хук под тестом, и
// снимает navigate/location в замыкание `snap` — им симулируем нажатие
// «Назад» браузером (POP), не завязываясь на goBack() самого хука.
function makeNavSpy(snap: Snapshot) {
  return function NavSpy(): null {
    const navigate = useNavigate();
    const location = useLocation();
    useEffect(() => {
      snap.nav = navigate;
      snap.loc = location;
    });
    return null;
  };
}

function makeWrapper(snap: Snapshot, initialEntries: string[], initialIndex: number) {
  const NavSpy = makeNavSpy(snap);
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={initialEntries} initialIndex={initialIndex}>
        <NavSpy />
        {children}
      </MemoryRouter>
    );
  };
}

describe('useHistorySheet — монтирование пушит запись истории', () => {
  it('после монтирования текущая запись истории помечена уникальным __sheetId', () => {
    const snap = makeSnapshot();
    const onClose = vi.fn();

    renderHook(() => useHistorySheet(onClose), {
      wrapper: makeWrapper(snap, ['/target'], 0),
    });

    expect(sheetState(snap.loc as Location)?.__sheetId).toEqual(expect.any(String));
    expect(sheetState(snap.loc as Location)?.__sheetId).not.toBe('');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('два независимых листа получают разные __sheetId', () => {
    const snapA = makeSnapshot();
    const snapB = makeSnapshot();

    renderHook(() => useHistorySheet(vi.fn()), {
      wrapper: makeWrapper(snapA, ['/a'], 0),
    });
    renderHook(() => useHistorySheet(vi.fn()), {
      wrapper: makeWrapper(snapB, ['/b'], 0),
    });

    expect(sheetState(snapA.loc as Location)?.__sheetId).not.toBe(
      sheetState(snapB.loc as Location)?.__sheetId,
    );
  });

  it('нажатие «Назад» (POP на предыдущую запись) закрывает лист один раз', () => {
    const snap = makeSnapshot();
    const onClose = vi.fn();

    renderHook(() => useHistorySheet(onClose), {
      wrapper: makeWrapper(snap, ['/target'], 0),
    });

    act(() => {
      void (snap.nav as NavigateFunction)(-1);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('useHistorySheet — goBack()', () => {
  it('goBack() закрывает лист ровно один раз', () => {
    const snap = makeSnapshot();
    const onClose = vi.fn();

    const { result } = renderHook(() => useHistorySheet(onClose), {
      wrapper: makeWrapper(snap, ['/target'], 0),
    });

    act(() => {
      result.current();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('goBack — это navigate(-1): возвращает на запись, существовавшую до монтирования листа', () => {
    const snap = makeSnapshot();
    const { result } = renderHook(() => useHistorySheet(vi.fn()), {
      wrapper: makeWrapper(snap, ['/hub', '/target'], 1),
    });

    act(() => {
      result.current();
    });

    expect((snap.loc as Location).pathname).toBe('/target');
    expect(sheetState(snap.loc as Location)?.__sheetId).toBeUndefined();
  });
});

// ── Реалистичный паттерн: родитель убирает лист из дерева по onClose ──
function Probe({ onClose }: { onClose: () => void }): null {
  useHistorySheet(onClose);
  return null;
}

function makeHarness(onCloseSpy: () => void) {
  return function Harness(): ReactNode {
    const [show, setShow] = useState(true);
    const handleClose = () => {
      onCloseSpy();
      setShow(false);
    };
    return show ? <Probe onClose={handleClose} /> : null;
  };
}

describe('useHistorySheet — нет двойного закрытия при реалистичном паттерне использования', () => {
  it('после первого «Назад» лист размонтируется, повторное «Назад» уже не вызывает onClose', () => {
    const snap = makeSnapshot();
    const onClose = vi.fn();
    const NavSpy = makeNavSpy(snap);
    const Harness = makeHarness(onClose);

    render(
      <MemoryRouter initialEntries={['/hub-1', '/hub-2', '/target']} initialIndex={2}>
        <NavSpy />
        <Harness />
      </MemoryRouter>,
    );

    act(() => {
      void (snap.nav as NavigateFunction)(-1);
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => {
      void (snap.nav as NavigateFunction)(-1);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('useHistorySheet — вложенные листы (ревью п.16)', () => {
  function Inner({ onClose }: { onClose: () => void }) {
    useHistorySheet(onClose);
    return null;
  }

  it('монтирование вложенного листа (PUSH) не закрывает внешний', () => {
    const outerClose = vi.fn();
    const innerClose = vi.fn();
    function Outer() {
      useHistorySheet(outerClose);
      const [showInner, setShowInner] = useState(false);
      return (
        <div>
          <button onClick={() => setShowInner(true)}>open inner</button>
          {showInner && <Inner onClose={innerClose} />}
        </div>
      );
    }

    const { getByText } = render(
      <MemoryRouter initialEntries={['/hub', '/target']} initialIndex={1}>
        <Outer />
      </MemoryRouter>,
    );

    act(() => {
      getByText('open inner').click();
    });

    expect(outerClose).not.toHaveBeenCalled();
    expect(innerClose).not.toHaveBeenCalled();
  });

  it('«Назад» закрывает вложенный лист первым, внешний остаётся; второе «Назад» закрывает внешний', () => {
    const snap = makeSnapshot();
    const outerClose = vi.fn();
    const innerClose = vi.fn();
    function Outer() {
      useHistorySheet(outerClose);
      const [showInner, setShowInner] = useState(false);
      return (
        <div>
          <button onClick={() => setShowInner(true)}>open inner</button>
          {showInner && (
            <Inner
              onClose={() => {
                innerClose();
                setShowInner(false);
              }}
            />
          )}
        </div>
      );
    }
    const NavSpy = makeNavSpy(snap);

    const { getByText } = render(
      <MemoryRouter initialEntries={['/hub', '/target']} initialIndex={1}>
        <NavSpy />
        <Outer />
      </MemoryRouter>,
    );

    // Вложенный лист монтируется отдельным шагом (как в ChannelSheet/
    // LessonSheet — по клику, а не в одном коммите с внешним) — иначе оба
    // pushState гонятся в одном цикле эффектов и порядок push перепутывается.
    act(() => {
      getByText('open inner').click();
    });

    act(() => {
      void (snap.nav as NavigateFunction)(-1);
    });
    expect(innerClose).toHaveBeenCalledTimes(1);
    expect(outerClose).not.toHaveBeenCalled();

    act(() => {
      void (snap.nav as NavigateFunction)(-1);
    });
    expect(outerClose).toHaveBeenCalledTimes(1);
  });
});

describe('useHistorySheet — размонтирование', () => {
  it('unmount() всего дерева хука не бросает исключений', () => {
    const snap = makeSnapshot();
    const { unmount } = renderHook(() => useHistorySheet(vi.fn()), {
      wrapper: makeWrapper(snap, ['/target'], 0),
    });

    expect(() => {
      unmount();
    }).not.toThrow();
  });
});
