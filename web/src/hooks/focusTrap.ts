// Обход фокусируемых элементов и ловушка Tab/Shift+Tab внутри диалога —
// вынесено из useDialog.ts отдельным файлом (аудит M3,
// docs/audits/2026-09-12-quality-audit.md), чтобы не пробить храповик
// размера файла и чтобы список селекторов был протестирован отдельно от
// эффектов монтирования/размонтирования.

// Тот же список, что назван в находке M3: ссылки с href, активные кнопки и
// поля формы, явный tabindex >= 0. Заголовок диалога (tabIndex={-1}) сюда не
// попадает — он получает фокус программно при открытии, но не участвует в
// обходе по Tab.
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

/** Tab с последнего элемента контейнера уводит на первый, Shift+Tab с
 * первого — на последний; уход фокуса за пределы контейнера (например, если
 * что-то снаружи перехватило фокус программно) возвращает его внутрь. Пустой
 * контейнер (диалог без единого контрола) просто не отдаёт фокус наружу. */
export function trapTabKey(container: HTMLElement, event: KeyboardEvent): void {
  const focusable = getFocusableElements(container);
  if (focusable.length === 0) {
    event.preventDefault();
    return;
  }
  const first = focusable[0] as HTMLElement;
  const last = focusable[focusable.length - 1] as HTMLElement;
  const active = document.activeElement;
  const atEdge = event.shiftKey ? active === first : active === last;
  const outside = !(active instanceof Node) || !container.contains(active);
  if (!atEdge && !outside) return;
  event.preventDefault();
  (event.shiftKey ? last : first).focus();
}

/**
 * Соседей контейнера по всей цепочке до `document.body` метим атрибутом
 * `inert` на время открытия диалога (M3): фон не должен получать ни клик, ни
 * фокус, ни внимание скринридера, пока диалог открыт. Диалоги в кабинете не
 * порталятся в body, поэтому «сосед» ищется на каждом уровне вверх по дереву,
 * а не только среди прямых детей body. Уже инертный элемент (вложенный
 * диалог поверх другого) не трогаем при восстановлении — состояние снимает
 * тот вызов, который его выставил.
 *
 * В jsdom (тесты vitest) атрибут `inert` не даёт браузерного эффекта — jsdom
 * не реализует ни исключение из tab-order, ни блокировку fokus()/кликов по
 * нему (проверено: в jsdom нет обработчиков `inert` в живых узлах). Поэтому
 * реальная защита от Tab в тестах — только trapTabKey выше, а inert здесь не
 * ломает и не подменяет её — это независимый слой для настоящих браузеров.
 */
export function markBackgroundInert(container: HTMLElement): () => void {
  const restore: Array<() => void> = [];
  let node: HTMLElement | null = container;
  while (node && node !== document.body) {
    const parent: HTMLElement | null = node.parentElement;
    if (!parent) break;
    // `children` — только элементы, текстовые узлы сюда не попадают, поэтому
    // проверка типа не нужна: `inert` ставится через Element API и работает
    // в том числе на встроенном SVG.
    for (const sibling of Array.from(parent.children)) {
      if (sibling === node) continue;
      if (sibling.hasAttribute('inert')) continue;
      sibling.setAttribute('inert', '');
      restore.push(() => sibling.removeAttribute('inert'));
    }
    node = parent;
  }
  return () => {
    for (const fn of restore) fn();
  };
}
