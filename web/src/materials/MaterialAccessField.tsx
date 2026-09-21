// Кто видит материал (ADR-0058, ADR-0096) — вынесено из MaterialFormFields.tsx
// (CLAUDE.md «Файлы»: React-компонент не растёт бесконечно, хуки и
// подкомпоненты выносятся). Радиогруппа из двух переключателей, тот же
// приём, что у вида материала (MATERIAL_KINDS в MaterialFormFields.tsx):
// состояние формы честно хранит `access`, не булев флаг. Доступа по оплате
// не существует (ADR-0096, отменяет ADR-0048): материал либо видят все
// ученики, либо не видит ни один.
import type { CSSProperties } from 'react';
import {
  MATERIAL_ACCESS_LABELS,
  MATERIAL_ACCESS_LEVELS,
  type MaterialAccess,
} from '@xuanxue/shared';
import { Toggle } from '../components/Toggle';

const LEGEND = 'Кто видит материал';
const RADIO_GROUP_NAME = 'material-access';
// «Только преподаватели» говорит прямо: ученик материал не увидит вовсе, а
// не «увидит закрытым».
const HINTS: Partial<Record<MaterialAccess, string>> = {
  staff: 'Ученик такой материал не увидит вовсе — ни в библиотеке, ни в архиве занятия.',
};

const fieldsetStyle: CSSProperties = {
  border: 'none',
  padding: 0,
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};
const legendStyle: CSSProperties = { fontSize: 14, fontWeight: 600, padding: 0 };

interface MaterialAccessFieldProps {
  value: MaterialAccess;
  onChange: (access: MaterialAccess) => void;
}

export function MaterialAccessField({ value, onChange }: MaterialAccessFieldProps) {
  return (
    <fieldset style={fieldsetStyle}>
      <legend style={legendStyle}>{LEGEND}</legend>
      {MATERIAL_ACCESS_LEVELS.map((option) => (
        <Toggle
          key={option}
          name={RADIO_GROUP_NAME}
          label={MATERIAL_ACCESS_LABELS[option]}
          hint={HINTS[option]}
          checked={value === option}
          onChange={() => onChange(option)}
        />
      ))}
    </fieldset>
  );
}
