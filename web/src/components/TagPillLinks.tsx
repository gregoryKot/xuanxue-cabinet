// Пилюли-ссылки тегов на карточках материала и занятия — ведут на экран тега
// (ADR-0075: «пилюля тега на карточке ведёт туда же»). Общий компонент для
// materials/MaterialCard.tsx и planning/LessonCard.tsx: своя копия строки
// пилюль на второй карточке — дубль, который поймал бы jscpd (CLAUDE.md
// «Одна механика — один компонент»).
//
// <Link>, не <button onClick={navigate}>: переход по-настоящему меняет
// адрес (можно открыть в новой вкладке средней кнопкой, важно для
// клавиатуры и скринридера — CLAUDE.md «Доступность»). Из-за этого пилюли
// не могут лежать внутри <button> строки (materials/MaterialCard.tsx) —
// вложенный интерактивный элемент в кнопке невалиден и недоступен, поэтому
// строка рисуется отдельным блоком-сиблингом.
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { tagsScreenPath } from '../lib/tagsScreenPath';
import { pillStyle } from './pillStyles';

const rowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  padding: '0 20px 16px',
};
const pillLinkStyle: CSSProperties = { ...pillStyle, textDecoration: 'none' };

interface TagPillLinksProps {
  tags: readonly string[];
  /** aria-label группы — «Теги материала»/«Теги занятия»: разный для двух
   * карточек, тот же приём, что у groupLabel в ListFilters.tsx. */
  groupLabel: string;
}

export function TagPillLinks({ tags, groupLabel }: TagPillLinksProps) {
  if (tags.length === 0) return null;

  return (
    <div style={rowStyle} role="group" aria-label={groupLabel}>
      {tags.map((tag) => (
        <Link key={tag} to={tagsScreenPath(tag)} style={pillLinkStyle}>
          {tag}
        </Link>
      ))}
    </div>
  );
}
