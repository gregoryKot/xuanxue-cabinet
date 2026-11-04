// Поле «Группы» формы занятия (ADR-0193): группы школы галочками и «Новая
// группа» тут же, под списком, — группу, которой ещё нет, не нужно искать на
// другом экране. Новая группа отмечается сразу: человек её завёл ради этого
// занятия. Механика галочек — общий CheckboxListField, ввод новой группы —
// AddGroupForm (тот же, что на экране «Школа»).
import { useCallback } from 'react';
import type { GroupDto } from '@xuanxue/shared';
import { CheckboxListField } from '../components/CheckboxListField';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { RichText } from '../components/RichText';
import { AddGroupForm } from '../groups/AddGroupForm';
import type { UseGroupsResult } from '../groups/useGroups';
import { useLatest } from '../hooks/useLatest';

const HINT = 'Названия отмеченных групп идут **первой строкой поста**.';
const EMPTY_MESSAGE = 'Групп пока нет. Заведите первую ниже.';

interface ClassGroupsFieldProps {
  groups: UseGroupsResult;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function ClassGroupsField({
  groups,
  selectedIds,
  onChange,
}: ClassGroupsFieldProps) {
  // Ответ на «Добавить» приходит позже: пока он в пути, человек мог отметить
  // другие группы — новая встаёт к тому, что выбрано сейчас, а не к тому, что
  // было при нажатии.
  const latestIds = useLatest(selectedIds);
  const { create } = groups;
  const addGroup = useCallback(
    async (name: string): Promise<GroupDto> => {
      const group = await create(name);
      onChange([...latestIds.current, group.id]);
      return group;
    },
    [create, onChange, latestIds],
  );

  if (groups.groups === null) {
    return groups.error ? (
      <LoadErrorBanner
        message={groups.error}
        onRetry={() => void groups.reload()}
        retryLabel="Обновить"
      />
    ) : null;
  }

  return (
    <>
      <CheckboxListField
        legend="Группы"
        options={groups.groups.map((group) => ({ id: group.id, label: group.name }))}
        selectedIds={selectedIds}
        onChange={onChange}
        hint={
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-soft)' }}>
            <RichText text={HINT} />
          </p>
        }
        emptyMessage={EMPTY_MESSAGE}
      />
      <AddGroupForm onAdd={addGroup} />
    </>
  );
}
