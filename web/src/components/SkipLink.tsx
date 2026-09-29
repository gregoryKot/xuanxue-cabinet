// Ссылка «Перейти к содержимому» (WCAG 2.4.1, уровень A) — первая остановка
// Tab на каждой странице: человек с клавиатурой или переключателем иначе
// проходит меню и шапку на каждом экране заново. Видна только когда на ней
// фокус (.xuanxue-skip-link в index.css), мышь и палец её не замечают.
//
// Не обычный якорь `#main-content`: он писал бы хеш в адрес и лишнюю запись в
// историю, и «Назад» возвращал бы на ту же страницу (CLAUDE.md «Фронтенд» про
// историю). Поэтому клик гасит переход и переводит фокус на <main> сам.
//
// Оба каркаса страниц — AppShell.tsx (кабинет) и EntryColumn.tsx (страницы до
// входа) — ставят ссылку первой и раздают <main> одни и те же свойства
// (mainLandmarkProps): гейт — тесты обоих каркасов, что первый Tab попадает на
// ссылку, а Enter уводит фокус в <main>.
import type { MouseEvent } from 'react';

const MAIN_CONTENT_ID = 'main-content';
const SKIP_LINK_LABEL = 'Перейти к содержимому';

/** Свойства <main>, на который ведёт ссылка. tabIndex -1 — фокус только
 * программой: в порядок Tab <main> не попадает. Рамку с него снимает
 * index.css (`main[tabindex='-1']`), иначе после перехода обводилась бы вся
 * страница. */
export const mainLandmarkProps = { id: MAIN_CONTENT_ID, tabIndex: -1 } as const;

function moveFocusToMain(event: MouseEvent<HTMLAnchorElement>): void {
  event.preventDefault();
  document.getElementById(MAIN_CONTENT_ID)?.focus();
}

export function SkipLink() {
  return (
    <a
      className="xuanxue-skip-link"
      href={`#${MAIN_CONTENT_ID}`}
      onClick={moveFocusToMain}
    >
      {SKIP_LINK_LABEL}
    </a>
  );
}
