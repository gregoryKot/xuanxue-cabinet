// Прокрутка к первой ошибке формы — контейнер может быть null (форма ещё не
// смонтирована), в контейнере может не быть ошибки, а jsdom не реализует
// scrollIntoView — ни один из этих случаев не должен падать (CLAUDE.md
// «Доступность», ADR-0046).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { scrollToFirstAlert, scrollToFirstAlertSoon } from './scrollToFirstAlert';

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    (query: string) => ({ matches, media: query }) as MediaQueryList,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  // jsdom не реализует scrollIntoView вовсе — тесты сами добавляют мок на
  // Element.prototype, снимаем его, чтобы не утекал в соседний тест.
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
});

describe('scrollToFirstAlert', () => {
  it('container === null — не падает', () => {
    expect(() => scrollToFirstAlert(null)).not.toThrow();
  });

  it('в контейнере нет ошибки — не падает', () => {
    document.body.innerHTML = '<form><input /></form>';
    const form = document.querySelector('form');

    expect(() => scrollToFirstAlert(form)).not.toThrow();
  });

  it('scrollIntoView отсутствует (как в jsdom по умолчанию) — не падает', () => {
    document.body.innerHTML = '<form><p role="alert">Ошибка</p></form>';
    const form = document.querySelector('form');
    const alert = form?.querySelector('[role="alert"]') as HTMLElement;
    // `in`, не `alert.scrollIntoView` в expect(...) — иначе
    // `@typescript-eslint/unbound-method` ругается на несвязанный метод.
    expect('scrollIntoView' in alert).toBe(false);

    expect(() => scrollToFirstAlert(form)).not.toThrow();
  });

  it('обычная анимация — behavior smooth, по центру', () => {
    document.body.innerHTML = '<form><p role="alert">Ошибка</p></form>';
    const form = document.querySelector('form');
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    scrollToFirstAlert(form);

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
  });

  it('prefers-reduced-motion — behavior auto', () => {
    document.body.innerHTML = '<form><p role="alert">Ошибка</p></form>';
    const form = document.querySelector('form');
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    stubMatchMedia(true);

    scrollToFirstAlert(form);

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'auto' });
  });

  it('несколько ошибок — прокрутка ровно к первой', () => {
    document.body.innerHTML =
      '<form><p role="alert">Первая</p><p role="alert">Вторая</p></form>';
    const form = document.querySelector('form');
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    scrollToFirstAlert(form);

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('matchMedia недоступен — считаем, что анимация не мешает (smooth)', () => {
    document.body.innerHTML = '<form><p role="alert">Ошибка</p></form>';
    const form = document.querySelector('form');
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    vi.stubGlobal('matchMedia', () => {
      throw new Error('недоступно');
    });

    scrollToFirstAlert(form);

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
  });
});

describe('scrollToFirstAlertSoon', () => {
  it('откладывает прокрутку на микротакт после вызова', async () => {
    document.body.innerHTML = '<form><p role="alert">Ошибка</p></form>';
    const form = document.querySelector('form');
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    scrollToFirstAlertSoon(form);
    expect(scrollIntoView).not.toHaveBeenCalled();

    await Promise.resolve();

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });
});
