import { describe, expect, it, vi } from 'vitest';
import { getFocusableElements, markBackgroundInert, trapTabKey } from './focusTrap';

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`тестовая разметка без #${id}`);
  return el;
}

function makeTabEvent(shiftKey = false) {
  const preventDefault = vi.fn();
  const event = { key: 'Tab', shiftKey, preventDefault } as unknown as KeyboardEvent;
  return { event, preventDefault };
}

describe('getFocusableElements', () => {
  it('находит ссылки с href, активные контролы и явный tabindex, пропускает остальное', () => {
    document.body.innerHTML = `
      <div id="container">
        <button>Первая</button>
        <button disabled>Отключена</button>
        <a href="/x">Ссылка</a>
        <a>Без href — не в обходе</a>
        <input />
        <input disabled />
        <span tabindex="0">В обходе по tabindex</span>
        <span tabindex="-1">Программный фокус, не в обходе</span>
      </div>
    `;

    const found = getFocusableElements(byId('container')).map((el) => el.tagName);

    expect(found).toEqual(['BUTTON', 'A', 'INPUT', 'SPAN']);
  });
});

describe('trapTabKey', () => {
  function renderTwoButtons() {
    document.body.innerHTML = `
      <div id="container">
        <button id="first">A</button>
        <button id="last">B</button>
      </div>
    `;
    return byId('container');
  }

  it('Tab с последнего элемента переносит фокус на первый', () => {
    const container = renderTwoButtons();
    byId('last').focus();
    const { event, preventDefault } = makeTabEvent(false);

    trapTabKey(container, event);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(byId('first'));
  });

  it('Shift+Tab с первого элемента переносит фокус на последний', () => {
    const container = renderTwoButtons();
    byId('first').focus();
    const { event, preventDefault } = makeTabEvent(true);

    trapTabKey(container, event);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(byId('last'));
  });

  it('Tab не с края не перехватывается', () => {
    document.body.innerHTML = `
      <div id="container">
        <button id="first">A</button>
        <button id="mid">B</button>
        <button id="last">C</button>
      </div>
    `;
    const container = byId('container');
    byId('mid').focus();
    const { event, preventDefault } = makeTabEvent(false);

    trapTabKey(container, event);

    expect(preventDefault).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(byId('mid'));
  });

  it('фокус, оказавшийся вне контейнера, возвращается внутрь', () => {
    document.body.innerHTML = `
      <button id="outside">Снаружи</button>
      <div id="container"><button id="first">A</button><button id="last">B</button></div>
    `;
    const container = byId('container');
    byId('outside').focus();
    const { event } = makeTabEvent(false);

    trapTabKey(container, event);

    expect(document.activeElement).toBe(byId('first'));
  });

  it('пустой контейнер не отдаёт фокус наружу', () => {
    document.body.innerHTML = '<div id="container"></div>';
    const container = byId('container');
    const { event, preventDefault } = makeTabEvent(false);

    trapTabKey(container, event);

    expect(preventDefault).toHaveBeenCalledTimes(1);
  });
});

describe('markBackgroundInert', () => {
  it('метит соседей контейнера по всей цепочке до body и снимает при восстановлении', () => {
    document.body.innerHTML = `
      <div id="before">До</div>
      <div id="wrap"><div id="dialog">Диалог</div></div>
      <div id="after">После</div>
    `;

    const restore = markBackgroundInert(byId('dialog'));

    expect(byId('before').hasAttribute('inert')).toBe(true);
    expect(byId('after').hasAttribute('inert')).toBe(true);
    // wrap — родитель диалога, а не сосед, inert не получает.
    expect(byId('wrap').hasAttribute('inert')).toBe(false);

    restore();

    expect(byId('before').hasAttribute('inert')).toBe(false);
    expect(byId('after').hasAttribute('inert')).toBe(false);
  });

  it('вложенный диалог не снимает inert, выставленный внешним при своём закрытии', () => {
    document.body.innerHTML = `
      <div id="page">Страница</div>
      <div id="outer"><div id="inner">Вложенный</div></div>
    `;

    const restoreOuter = markBackgroundInert(byId('outer'));
    const restoreInner = markBackgroundInert(byId('inner'));
    expect(byId('page').hasAttribute('inert')).toBe(true);

    restoreInner();
    // Внешний диалог (ConfirmDialog поверх ChannelSheet) всё ещё открыт —
    // страница должна остаться недоступной.
    expect(byId('page').hasAttribute('inert')).toBe(true);

    restoreOuter();
    expect(byId('page').hasAttribute('inert')).toBe(false);
  });
  it('контейнер вне документа не роняет разметку фона: снимать нечего', () => {
    // Диалог, отрендеренный в отсоединённое дерево (тест или portal до вставки):
    // подниматься от него некуда — идём до первого узла без родителя и выходим.
    const detached = document.createElement('div');
    document.body.innerHTML = '<div id="page">Страница</div>';

    const restore = markBackgroundInert(detached);

    expect(byId('page').hasAttribute('inert')).toBe(false);
    expect(() => restore()).not.toThrow();
  });
});
