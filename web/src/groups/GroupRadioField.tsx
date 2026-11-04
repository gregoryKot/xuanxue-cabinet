// Выбор группы радио — одна механика для формы занятия и формы канала
// (CLAUDE.md «Одна механика — один компонент», ADR-0195): «одна группа или
// никакой», у занятия ещё и «Все группы». «Новая группа» стоит тут же, под
// списком: группу, которой ещё нет, не нужно искать на
// другом экране; новая отмечается сразу — человек завёл её ради этого выбора.
// Сам список радио — общий RadioListField, ввод группы — AddGroupForm (тот же,
// что на экране «Школа»).
import type { ReactNode } from 'react';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { listFieldHintStyle } from '../components/ListFieldFrame';
import { RadioListField, type RadioListOption } from '../components/RadioListField';
import { AddGroupForm } from './AddGroupForm';
import { ALL_GROUPS_CHOICE, NO_GROUP_CHOICE } from './groupChoice';
import type { UseGroupsResult } from './useGroups';

interface GroupRadioFieldProps {
  legend: string;
  /** Подпись строки «группы нет»: у занятия — «Без группы», у канала — «Пока никакой». */
  noneLabel: string;
  /** Передано — в списке есть строка «Все группы» (только у занятия). */
  allLabel?: string;
  groups: UseGroupsResult;
  value: string;
  onChange: (value: string) => void;
  hint: ReactNode;
}

const EMPTY_MESSAGE = 'Групп пока нет. Заведите первую ниже.';

export function GroupRadioField({
  legend,
  noneLabel,
  allLabel,
  groups,
  value,
  onChange,
  hint,
}: GroupRadioFieldProps) {
  if (groups.groups === null) {
    return groups.error ? (
      <LoadErrorBanner
        message={groups.error}
        onRetry={() => void groups.reload()}
        retryLabel="Обновить"
      />
    ) : null;
  }

  const options: RadioListOption[] = [
    { id: NO_GROUP_CHOICE, label: noneLabel },
    ...(allLabel ? [{ id: ALL_GROUPS_CHOICE, label: allLabel }] : []),
    ...groups.groups.map((group) => ({ id: group.id, label: group.name })),
  ];

  async function addGroup(name: string) {
    const group = await groups.create(name);
    onChange(group.id);
    return group;
  }

  return (
    <>
      <RadioListField
        legend={legend}
        options={options}
        selectedId={value}
        onChange={onChange}
        hint={hint}
      />
      {groups.groups.length === 0 && <p style={listFieldHintStyle}>{EMPTY_MESSAGE}</p>}
      <AddGroupForm onAdd={addGroup} />
    </>
  );
}
