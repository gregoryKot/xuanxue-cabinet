// Поле «Новая группа» с кнопкой «Добавить» — одна механика для экрана «Школа»
// и формы занятия (CLAUDE.md «Одна механика — один компонент», ADR-0193).
// Стоит и внутри формы занятия, поэтому это не `<form>`, а ряд с кнопкой
// `type="button"`; Enter в поле добавляет группу, а не отправляет всю форму.
import type { KeyboardEvent } from 'react';
import { Button } from '../components/Button';
import { Field, inputStyle } from '../components/Field';
import { FormServerError } from '../components/FormServerError';
import { primaryActionStyle } from '../components/screenLayout';
import { useAddGroup } from './useAddGroup';

interface AddGroupFormProps {
  onAdd: (name: string) => Promise<unknown>;
}

export function AddGroupForm({ onAdd }: AddGroupFormProps) {
  const add = useAddGroup(onAdd);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void add.submit();
  }

  return (
    <>
      <Field label="Новая группа">
        <input
          style={inputStyle}
          value={add.name}
          maxLength={add.maxLength}
          onChange={(event) => add.setName(event.target.value)}
          onKeyDown={handleKeyDown}
        />
      </Field>
      <FormServerError error={add.error} />
      <Button
        type="button"
        variant="secondary"
        style={primaryActionStyle}
        pending={add.pending}
        onClick={() => void add.submit()}
      >
        Добавить
      </Button>
    </>
  );
}
