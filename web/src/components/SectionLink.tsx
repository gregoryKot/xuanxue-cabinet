// Переход в подэкран своего раздела — низ экрана, за волосяной линией:
// сначала то, ради чего сюда зашли, потом всё остальное (docs/adr/0025 —
// вход в подэкран живёт в своём разделе, не пунктом меню).
//
// Раньше был карточкой с рамкой, подложкой и иконкой; направление «тихо и
// благородно» (docs/adr/0031) коробок не знает — текстовая ссылка и строка
// объяснения под ней (отзыв владельца 2026-09-16, образец — низ «Занятий»).
// У `<a>` нет своей строки в index.css: без textLinkStyle браузер красит
// ссылку системным синим.
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { screenHintStyle, textLinkStyle } from './screenLayout';

const wrapStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 6,
  paddingTop: 20,
  borderTop: '1px solid var(--line)',
};
const hintStyle: CSSProperties = { ...screenHintStyle, margin: 0 };

export interface SectionLinkProps {
  to: string;
  title: string;
  hint: string;
}

export function SectionLink({ to, title, hint }: SectionLinkProps) {
  return (
    <div style={wrapStyle}>
      <Link to={to} style={textLinkStyle}>
        {title}
      </Link>
      <p style={hintStyle}>{hint}</p>
    </div>
  );
}
