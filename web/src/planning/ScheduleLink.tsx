// Переход в сетку расписания — низ экрана «Занятия», за волосяной линией:
// сначала занятия, ради которых сюда зашли, потом всё остальное
// (docs/adr/0025-navigation-by-domain.md — вход в подэкран живёт в своём
// разделе). Раньше был карточкой с рамкой и иконкой
// (components/SectionLink.tsx); направление «тихо и благородно»
// (docs/adr/0031, макет Schedule.dc.html) коробок с рамками не знает, а у
// `<a>` нет своей строки в index.css — без textLinkStyle браузер красит
// ссылку системным синим.
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { screenHintStyle, textLinkStyle } from '../components/screenLayout';

const TITLE = 'Сетка расписания';
const HINT = 'Дни, время, ссылки Zoom, ведущие. Из них рождаются занятия здесь.';

const wrapStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 6,
  paddingTop: 20,
  borderTop: '1px solid var(--line)',
};
const hintStyle: CSSProperties = { ...screenHintStyle, margin: 0 };

export function ScheduleLink() {
  return (
    <div style={wrapStyle}>
      <Link to="/schedule" style={textLinkStyle}>
        {TITLE}
      </Link>
      <p style={hintStyle}>{HINT}</p>
    </div>
  );
}
