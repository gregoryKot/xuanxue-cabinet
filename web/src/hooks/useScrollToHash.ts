// Переход по якорю `#lesson-{id}` со «Сводки» на «Планирование» — прокрутка
// к карточке и короткая подсветка, иначе ссылка ведёт «в никуда» на длинном
// списке занятий. Подсветка — CSS-класс с `transition` (index.css,
// `.xuanxue-hash-highlight`): анимацию глушит уже существующее правило
// `prefers-reduced-motion` там же, отдельной проверки в JS не нужно.
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export const HASH_HIGHLIGHT_CLASS = 'xuanxue-hash-highlight';
const HIGHLIGHT_MS = 1500;

/** `ready` — данные экрана загружены и список отрисован: без этого условия
 * эффект срабатывает раньше, чем элемент с нужным `id` появится в DOM. */
export function useScrollToHash(ready: boolean): void {
  const { hash } = useLocation();

  useEffect(() => {
    if (!ready || !hash) return;
    const el = document.getElementById(hash.slice(1));
    if (!el) return;

    el.scrollIntoView({ block: 'center' });
    el.classList.add(HASH_HIGHLIGHT_CLASS);
    const timer = window.setTimeout(
      () => el.classList.remove(HASH_HIGHLIGHT_CLASS),
      HIGHLIGHT_MS,
    );
    return () => window.clearTimeout(timer);
  }, [ready, hash]);
}
