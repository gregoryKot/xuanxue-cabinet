// Кто видит материал (ADR-0048, ADR-0058) — вынесено из MaterialFormFields.tsx
// (CLAUDE.md «Файлы»: React-компонент не растёт бесконечно, хуки и
// подкомпоненты выносятся). Радиогруппа из трёх переключателей, тот же
// приём, что у вида материала (MATERIAL_KINDS в MaterialFormFields.tsx):
// состояние формы честно хранит `access`, не два булевых флага.
import type { CSSProperties } from 'react';
import {
  MATERIAL_ACCESS_LABELS,
  MATERIAL_ACCESS_LEVELS,
  type MaterialAccess,
} from '@xuanxue/shared';
import { Toggle } from '../components/Toggle';

const LEGEND = 'Кто видит материал';
const RADIO_GROUP_NAME = 'material-access';
// ADR-0048, ADR-0058, VOICE.md: выбор сам по себе не закрывает материал —
// «после оплаты» решает рубильник школы на экране «Библиотека»
// (MaterialsPaidAccessSection.tsx), и текст здесь не должен спорить с тем,
// что написано там. «Только преподаватели» говорит прямо: ученик материал не
// увидит вовсе, не «увидит закрытым», как у платного.
const HINTS: Partial<Record<MaterialAccess, string>> = {
  paid: 'Сработает, когда на «Библиотеке» включат доступ по оплате. Пока он выключен, материал видят все.',
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
