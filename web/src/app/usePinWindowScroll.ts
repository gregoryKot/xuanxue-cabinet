// Пока оболочка кабинета на экране, окно браузера держится в (0, 0).
//
// Симптом: на телефоне (iPhone, чаще установленное приложение) человек ввёл
// текст, свернул клавиатуру — и оболочка осталась сдвинутой вверх, а под
// нижним меню виднеется пустая полоса бумаги, пока что-нибудь не заставит
// страницу пересчитаться (отзыв владельца 2026-10-01: «при сворачивании
// клавиатуры иногда дыра появляется»). Открывая клавиатуру, iOS прокручивает
// окно, чтобы показать поле, а на закрытии не всегда возвращает его назад.
//
// Почему это безопасно именно здесь: оболочка ровно в высоту экрана, окно в
// ней не прокручивается никогда — прокручивается только колонка содержимого
// (appShellStyles.ts, contentColumnStyle). Смещение окна в кабинете — всегда
// остаток после клавиатуры, и возвращать его на место некому, кроме нас.
// Вторая половина лечения — standalone.css: с body снят отступ safe-area,
// из-за которого документ был выше экрана и окно вообще можно было сдвинуть.
//
// Почему хук не висит на страницах входа и других вне оболочки: они
// прокручивают сам документ, и сброс в (0, 0) на каждом выходе из поля
// швырял бы человека к началу страницы. Поэтому хук зовёт AppShell, а не
// корень приложения.
//
// Когда не трогаем: пока клавиатура остаётся (фокус перешёл в другое
// текстовое поле или поле всё ещё в фокусе), сдвиг окна нужен iOS, чтобы
// показать поле, — вернуть его значило бы спрятать поле под клавиатуру. Сброс
// делаем, когда фокус ушёл в никуда или на элемент без клавиатуры, и ещё раз —
// когда visualViewport меняет размер без поля в фокусе: это конец анимации
// сворачивания, на котором iOS и оставляет смещение.
import { useEffect } from 'react';

// Типы `<input>`, при которых клавиатура не открывается: фокус на такой
// кнопке или флажке не оставляет причин держать окно сдвинутым.
const NON_KEYBOARD_INPUT_TYPES: ReadonlySet<string> = new Set([
  'checkbox',
  'radio',
  'button',
  'submit',
  'reset',
  'file',
  'range',
  'color',
  'image',
  'hidden',
]);

// Значения атрибута `contenteditable`, при которых элемент правится руками.
// Пустая строка — тоже «да»: `<div contenteditable>` без значения.
const EDITABLE_ATTRIBUTE_VALUES: ReadonlySet<string> = new Set([
  '',
  'true',
  'plaintext-only',
]);

function isContentEditable(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  // `isContentEditable` учитывает наследование от родителя, но jsdom его не
  // знает — поэтому и атрибут: тест на нём не краснеет от окружения.
  if (el.isContentEditable) return true;
  const attribute = el.getAttribute('contenteditable');
  return attribute !== null && EDITABLE_ATTRIBUTE_VALUES.has(attribute.toLowerCase());
}

/**
 * Откроет ли фокус на элементе экранную клавиатуру (или список выбора у
 * `<select>`: iOS и его показывает, сдвигая страницу так же).
 */
export function isTextEntry(el: Element | null): boolean {
  if (el === null) return false;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) return !NON_KEYBOARD_INPUT_TYPES.has(el.type);
  return isContentEditable(el);
}

// Проверка перед вызовом, а не безусловный scrollTo: на каждый выход из поля
// лишний вызов ни к чему, а в тестах и на настольных браузерах он шумит.
function resetWindowScroll(): void {
  if (window.scrollX === 0 && window.scrollY === 0) return;
  window.scrollTo(0, 0);
}

export function usePinWindowScroll(): void {
  useEffect(() => {
    const handleFocusOut = (event: FocusEvent) => {
      // Куда уходит фокус — известно только здесь: к следующему `focusin`
      // `document.activeElement` ещё `body`.
      const next = event.relatedTarget instanceof Element ? event.relatedTarget : null;
      if (isTextEntry(next)) return;
      resetWindowScroll();
    };
    const handleViewportResize = () => {
      if (isTextEntry(document.activeElement)) return;
      resetWindowScroll();
    };

    document.addEventListener('focusout', handleFocusOut);
    // visualViewport нет в старых браузерах — тогда остаётся только focusout.
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', handleViewportResize);

    return () => {
      document.removeEventListener('focusout', handleFocusOut);
      viewport?.removeEventListener('resize', handleViewportResize);
    };
  }, []);
}
