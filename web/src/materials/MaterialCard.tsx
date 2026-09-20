// Строка материала в списке — вид, привязанные занятия, отметка доступа
// («после оплаты» или «только преподаватели», docs/PLAN.md §14, ADR-0047,
// ADR-0048, ADR-0058). Тот же приём, что у ChannelCard.tsx: общую карточку
// красит список (oneCardListStyle), строка несёт только паддинг и волосяную
// линию снизу — у последней строки линии нет. <button>, не <div onClick>
// (CLAUDE.md «Доступность»).
import type { CSSProperties } from 'react';
import {
  MATERIAL_ACCESS_LABELS,
  MATERIAL_KIND_LABELS,
  type MaterialDto,
} from '@xuanxue/shared';
import { listCardMetaStyle, listCardTitleStyle } from '../components/listCardStyles';

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
  // Порядок — вид, занятия, теги, отметка доступа (ADR-0058: теги после вида
  // и занятий, отметка — как последний служебный флаг, тот же порядок, что у
  // версии вопроса в ExamItemCard.tsx). `all` не отмечается вовсе — только
  // отступление от базового «видят все ученики» стоит подписывать.
  const metaParts = [
    MATERIAL_KIND_LABELS[material.kind],
    ...classTitles,
    ...material.tags,
    ...(material.access === 'all' ? [] : [MATERIAL_ACCESS_LABELS[material.access]]),
  ];

  return (
    <li style={{ borderBottom: isLast ? 'none' : '1px solid var(--panel)' }}>
      <button type="button" style={rowButtonStyle} onClick={onSelect}>
        <div style={listCardTitleStyle}>{material.title}</div>
        <div style={listCardMetaStyle}>{metaParts.join(' · ')}</div>
      </button>
    </li>
  );
}
