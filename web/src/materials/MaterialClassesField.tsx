// Занятия, к которым привязан материал (docs/PLAN.md §14, ADR-0047) — список
// расписания галочками, общая механика с ClassChannelsField.tsx —
// components/CheckboxListField.tsx (CLAUDE.md «Одна механика — один
// компонент»), здесь только своя подпись и текст пустого состояния. Пустой
// список занятий — осознанный выбор «материал всей школы» (ADR-0047), не
// ошибка формы: подсказка говорит об этом прямо, а не молчит.
import { Link } from 'react-router-dom';
import type { ClassDto } from '@xuanxue/shared';
import { CheckboxListField } from '../components/CheckboxListField';

const LEGEND = 'Занятия';
const HINT = 'Не отметите ни одного — материал увидят ученики любого занятия школы.';

interface MaterialClassesFieldProps {
  classes: ClassDto[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function MaterialClassesField({
  classes,
  selectedIds,
  onChange,
}: MaterialClassesFieldProps) {
  return (
    <CheckboxListField
      legend={LEGEND}
      options={classes.map((cls) => ({ id: cls.id, label: cls.title }))}
      selectedIds={selectedIds}
      onChange={onChange}
      hint={<p style={{ margin: 0, fontSize: 13, color: 'var(--ink-soft)' }}>{HINT}</p>}
      emptyMessage={
        <>
          Занятий пока нет. Добавьте их в <Link to="/schedule">«Расписании»</Link> — потом
          привяжите материал здесь.
        </>
      }
    />
  );
}
