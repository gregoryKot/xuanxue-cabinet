// Строка материала в списке — вид, привязанные занятия, отметка доступа
// («только преподаватели», docs/PLAN.md §14, ADR-0047, ADR-0058, ADR-0096)
// и теги отдельной строкой пилюль под подписью — каждая ведёт на экран тега
// (ADR-0075). Тот же приём, что у ChannelCard.tsx: общую
// карточку красит список (oneCardListStyle), строка несёт только паддинг и
// волосяную линию снизу — у последней строки линии нет. <button>, не
// <div onClick> (CLAUDE.md «Доступность»).
import type { CSSProperties } from 'react';
import {
  MATERIAL_ACCESS_LABELS,
  MATERIAL_KIND_LABELS,
  type MaterialDto,
} from '@xuanxue/shared';
import { listCardMetaStyle, listCardTitleStyle } from '../components/listCardStyles';
import { TagPillLinks } from '../components/TagPillLinks';

const TAGS_GROUP_LABEL = 'Теги материала';

// `<button>` приносит свою рамку и фон — без явного сброса строка выглядела
// бы обведённой поверх общей карточки списка (тот же приём, что у
// ChannelCard.tsx).
const rowButtonStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  minHeight: 44,
  padding: '16px 20px',
  border: 'none',
  background: 'transparent',
  font: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
};

interface MaterialCardProps {
  material: MaterialDto;
  /** Название занятия по id — школа хранит их в useClasses(); если материал
   * ссылается на id, которого в списке уже нет, строка просто его пропускает. */
  classTitleById: Map<string, string>;
  onSelect: () => void;
  /** Последняя строка общей карточки списка — без нижней волосяной линии
   * (MaterialsScreen.tsx, docs/adr/0043). */
  isLast?: boolean;
}

export function MaterialCard({
  material,
  classTitleById,
  onSelect,
  isLast = false,
}: MaterialCardProps) {
  const classTitles = material.classIds
    .map((id) => classTitleById.get(id))
    .filter((title): title is string => Boolean(title));
  // Порядок — вид, занятия, отметка доступа (ADR-0058, ADR-0047): `all` не
  // отмечается вовсе — только отступление от базового «видят все ученики»
  // стоит подписывать. Теги (ADR-0058) переехали из этой строки в свою
  // строку пилюль ниже (ADR-0075: пилюля ведёт на экран тега) — <a> внутри
  // <button> невалиден и недоступен, join одной строкой для ссылок не годится.
  const metaParts = [
    MATERIAL_KIND_LABELS[material.kind],
    ...classTitles,
    ...(material.access === 'all' ? [] : [MATERIAL_ACCESS_LABELS[material.access]]),
  ];

  return (
    <li style={{ borderBottom: isLast ? 'none' : '1px solid var(--panel)' }}>
      <button type="button" style={rowButtonStyle} onClick={onSelect}>
        <div style={listCardTitleStyle}>{material.title}</div>
        <div style={listCardMetaStyle}>{metaParts.join(' · ')}</div>
      </button>
      <TagPillLinks tags={material.tags} groupLabel={TAGS_GROUP_LABEL} />
    </li>
  );
}
