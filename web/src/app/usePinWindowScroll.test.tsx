import { renderHook } from '@testing-library/react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import { isTextEntry, usePinWindowScroll } from './usePinWindowScroll';

const SHIFTED_SCROLL_PX = 40;

type ScrollAxis = 'scrollX' | 'scrollY';

type WindowProperty = ScrollAxis | 'visualViewport';

// Исходные описания свойств окна, снятые до подмены: jsdom держит `scrollY`
// собственным свойством окна, и после теста его нужно вернуть как было, а не
// просто стереть — иначе следующий файл увидит `undefined` вместо 0.
const originalDescriptors = new Map<WindowProperty, PropertyDescriptor | undefined>();

function stubWindowProperty(name: WindowProperty, value: unknown) {
  if (!originalDescriptors.has(name)) {
    originalDescriptors.set(name, Object.getOwnPropertyDescriptor(window, name));
  }
  Object.defineProperty(window, name, { configurable: true, value });
}

function restoreWindowProperties() {
  originalDescriptors.forEach((descriptor, name) => {
    if (descriptor) Object.defineProperty(window, name, descriptor);
    else Reflect.deleteProperty(window, name);
  });
  originalDescriptors.clear();
}

// jsdom не прокручивает окно сам, поэтому смещение задаём вручную.
function stubWindowScroll(axis: ScrollAxis, value: number) {
  stubWindowProperty(axis, value);
}

function stubVisualViewport(viewport: EventTarget | undefined) {
  stubWindowProperty('visualViewport', viewport);
}

function appendElement<T extends HTMLElement>(el: T): T {
  document.body.appendChild(el);
  return el;
}

function appendInput(type: string): HTMLInputElement {
  const input = document.createElement('input');
  input.type = type;
  return appendElement(input);
}

function blurTo(from: HTMLElement, relatedTarget: HTMLElement | null) {
  from.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget }));
}

let scrollTo: MockInstance<typeof window.scrollTo>;
let viewport: EventTarget;

beforeEach(() => {
  scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  viewport = new EventTarget();
  stubVisualViewport(viewport);
  stubWindowScroll('scrollX', 0);
  stubWindowScroll('scrollY', SHIFTED_SCROLL_PX);
});

afterEach(() => {
  scrollTo.mockRestore();
  restoreWindowProperties();
  document.body.replaceChildren();
});

describe('usePinWindowScroll — focusout', () => {
  it('поле потеряло фокус, и он никуда не ушёл — окно возвращается в (0, 0)', () => {
    renderHook(() => usePinWindowScroll());
    const input = appendInput('text');

    blurTo(input, null);

    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('фокус перешёл в другое текстовое поле — окно не трогаем, клавиатура остаётся', () => {
    renderHook(() => usePinWindowScroll());
    const first = appendInput('text');
    const second = appendInput('email');

    blurTo(first, second);

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('фокус перешёл на флажок — клавиатура уйдёт, окно возвращается', () => {
    renderHook(() => usePinWindowScroll());
    const input = appendInput('text');
    const checkbox = appendInput('checkbox');

    blurTo(input, checkbox);

    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('окно и так в (0, 0) — scrollTo не зовём', () => {
    stubWindowScroll('scrollY', 0);
    renderHook(() => usePinWindowScroll());
    const input = appendInput('text');

    blurTo(input, null);

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('сдвиг только по горизонтали тоже возвращается', () => {
    stubWindowScroll('scrollY', 0);
    stubWindowScroll('scrollX', SHIFTED_SCROLL_PX);
    renderHook(() => usePinWindowScroll());
    const input = appendInput('text');

    blurTo(input, null);

    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });
});

describe('usePinWindowScroll — visualViewport', () => {
  it('размер вьюпорта изменился, поле в фокусе — окно не трогаем', () => {
    renderHook(() => usePinWindowScroll());
    appendInput('text').focus();

    viewport.dispatchEvent(new Event('resize'));

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('размер вьюпорта изменился, фокуса в поле нет — окно возвращается', () => {
    renderHook(() => usePinWindowScroll());
    appendInput('text').focus();
    (document.activeElement as HTMLElement).blur();

    viewport.dispatchEvent(new Event('resize'));

    expect(document.activeElement).toBe(document.body);
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('браузер без visualViewport — хук не падает и отвечает на focusout', () => {
    stubVisualViewport(undefined);
    renderHook(() => usePinWindowScroll());
    const input = appendInput('text');

    blurTo(input, null);

    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });
});

describe('usePinWindowScroll — размонтирование', () => {
  it('после размонтирования события окно больше не трогают', () => {
    const { unmount } = renderHook(() => usePinWindowScroll());
    const input = appendInput('text');
    unmount();

    blurTo(input, null);
    viewport.dispatchEvent(new Event('resize'));

    expect(scrollTo).not.toHaveBeenCalled();
  });
});

describe('isTextEntry', () => {
  function editableDiv(attribute: string): HTMLElement {
    const div = document.createElement('div');
    div.setAttribute('contenteditable', attribute);
    return div;
  }

  it.each(['text', 'email', 'number', 'search'])(
    'input type=%s открывает клавиатуру',
    (type) => {
      expect(isTextEntry(appendInput(type))).toBe(true);
    },
  );

  it.each(['checkbox', 'radio', 'file', 'button', 'submit', 'range'])(
    'input type=%s клавиатуру не открывает',
    (type) => {
      expect(isTextEntry(appendInput(type))).toBe(false);
    },
  );

  it('textarea, select и contenteditable открывают клавиатуру или список', () => {
    expect(isTextEntry(document.createElement('textarea'))).toBe(true);
    expect(isTextEntry(document.createElement('select'))).toBe(true);
    expect(isTextEntry(editableDiv('true'))).toBe(true);
    expect(isTextEntry(editableDiv(''))).toBe(true);
  });

  // Потомок редактируемого блока правится руками без собственного атрибута.
  // jsdom `isContentEditable` не знает, поэтому браузерное свойство подменяем.
  it('элемент внутри редактируемого блока — поле ввода', () => {
    const child = document.createElement('span');
    Object.defineProperty(child, 'isContentEditable', { value: true });

    expect(isTextEntry(child)).toBe(true);
  });

  it('SVG-элемент не HTML-элемент и полем ввода не бывает', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('contenteditable', 'true');

    expect(isTextEntry(svg)).toBe(false);
  });

  it('contenteditable="false", обычный div и null — не поле ввода', () => {
    expect(isTextEntry(editableDiv('false'))).toBe(false);
    expect(isTextEntry(document.createElement('div'))).toBe(false);
    expect(isTextEntry(null)).toBe(false);
  });
});
