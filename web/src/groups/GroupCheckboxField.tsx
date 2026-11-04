// Поле «Группы» — галочками, одна механика для формы занятия и формы канала
// (CLAUDE.md «Одна механика — один компонент», ADR-0196): и у занятия, и у
// канала групп может быть несколько. «Новая группа» стоит тут же, под списком:
// группу, которой ещё нет, не нужно искать на другом экране; новая отмечается
// сразу — человек завёл её ради этого выбора. Механика галочек — общий
// CheckboxListField, ввод новой группы — AddGroupForm (тот же, что на экране
// «Школа»). Подсказка приходит от формы: у занятия и у канала она разная.
import { useCallback } from 'react';
import type { GroupDto } from '@xuanxue/shared';
import { CheckboxListField } from '../components/CheckboxListField';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { RichText } from '../components/RichText';
import { useLatest } from '../hooks/useLatest';
import { AddGroupForm } from './AddGroupForm';
import type { UseGroupsResult } from './useGroups';

const EMPTY_MESSAGE = 'Групп пока нет. Заведите первую ниже.';

interface GroupCheckboxFieldProps {
  groups: UseGroupsResult;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** Маркированный текст (`**…**`) — что делает выбор и что будет без групп. */
  hint: string;
}

export function GroupCheckboxField({
  groups,
  selectedIds,
  onChange,
  hint,
}: GroupCheckboxFieldProps) {
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
            <RichText text={hint} />
          </p>
        }
        emptyMessage={EMPTY_MESSAGE}
      />
      <AddGroupForm onAdd={addGroup} />
    </>
  );
}
