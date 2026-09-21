// Единственный шеврон кабинета (CLAUDE.md «Одна механика — один компонент»):
// значок списка выбора (Select.tsx) и знак раскрытия у текстовой кнопки
// (TextLinkButton.tsx) — одна и та же галочка, а не две похожие. Рисуется
// инлайновым svg, не фон-картинкой: `background-image` с data:-URI требовал
// бы записи источника в api/src/security/csp.ts на каждую правку значка (CSP
// кабинета перечисляет источники явно), инлайновому svg добавлять туда
// нечего.
//
// Декоративный всегда: рядом либо видимая подпись («Как выложить видео…»),
// либо доступное имя самого контрола (Select). Скринридеру знак не нужен, а
// «раскрыто/свёрнуто» он берёт из `aria-expanded`, не из картинки.
import type { CSSProperties } from 'react';

// 12px — размер, подобранный в поле выбора (Select.tsx): рядом с текстом
// 15px значок мельче строки и не спорит с ней.
const SIZE_PX = 12;
const STROKE_WIDTH = 1.4;
// Галочка нарисована смотрящей вниз («раскрыто»); свёрнутое состояние —
// та же галочка, повёрнутая вправо. Одна фигура на оба состояния.
const COLLAPSED_ROTATION = 'rotate(-90deg)';

interface ChevronIconProps {
  /** Повернуть вправо — «свёрнуто». По умолчанию смотрит вниз. */
  collapsed?: boolean;
  style?: CSSProperties;
}

export function ChevronIcon({ collapsed, style }: ChevronIconProps) {
  return (
    <svg
      width={SIZE_PX}
      height={SIZE_PX}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE_WIDTH}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={collapsed ? { ...style, transform: COLLAPSED_ROTATION } : style}
    >
      <path d="M2 4.5 L6 8.5 L10 4.5" />
    </svg>
  );
}
