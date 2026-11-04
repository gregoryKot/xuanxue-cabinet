// Радио «Группа» формы занятия (ADR-0195): «Без группы», «Все группы» и группы
// школы; «Новая группа» — под списком (GroupRadioField). Подсказка стоит до
// первого действия: что делает выбор и что будет без группы.
import { RichText } from '../components/RichText';
import { GroupRadioField } from '../groups/GroupRadioField';
import type { UseGroupsResult } from '../groups/useGroups';

const HINT =
  'Ссылка и запись уйдут в каналы выбранной группы, а её название — **первая строка поста**. Без группы занятие никуда не уходит.';

interface ClassGroupFieldProps {
  groups: UseGroupsResult;
  value: string;
  onChange: (value: string) => void;
}

export function ClassGroupField({ groups, value, onChange }: ClassGroupFieldProps) {
  return (
    <GroupRadioField
      legend="Группа"
      noneLabel="Без группы"
      allLabel="Все группы"
      groups={groups}
      value={value}
      onChange={onChange}
      hint={
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-soft)' }}>
          <RichText text={HINT} />
        </p>
      }
    />
  );
}
