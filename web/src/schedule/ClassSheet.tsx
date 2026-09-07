// Лист создания/правки занятия — `position: fixed; inset: 0` обязан идти
// через useHistorySheet (кнопка «Назад» браузера) и вести себя как диалог
// (useDialog: role="dialog", фокус на заголовок, Esc, блокировка скролла
// фона, возврат фокуса — CLAUDE.md «Доступность»). Форма/валидация —
// useClassForm, здесь только разметка и подключение хуков.
import type { CSSProperties, FormEvent } from 'react';
import type { ClassDto, CreateClassInput, UpdateClassInput } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { useDialog } from '../hooks/useDialog';
import { useHistorySheet } from '../hooks/useHistorySheet';
import { ClassFormFields } from './ClassFormFields';
import { RuleFields } from './RuleFields';
import { useClassForm } from './useClassForm';

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 20, 0.45)',
  display: 'flex',
  alignItems: 'flex-end',
  zIndex: 50,
};
const sheetStyle: CSSProperties = {
  background: 'var(--surface-2)',
  width: '100%',
  maxHeight: '92vh',
  overflowY: 'auto',
  borderRadius: '16px 16px 0 0',
  padding: 20,
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};
const headerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

interface ClassSheetProps {
  classDto: ClassDto | null;
  onClose: () => void;
  onCreate: (input: CreateClassInput) => Promise<void>;
  onUpdate: (id: string, input: UpdateClassInput) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}

export function ClassSheet({
  classDto,
  onClose,
  onCreate,
  onUpdate,
  onRemove,
}: ClassSheetProps) {
  const goBack = useHistorySheet(onClose);
  const { headingRef } = useDialog(goBack);
  const form = useClassForm(classDto, onCreate, onUpdate, onRemove);
  const noRules = form.state.rules.length === 0;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (await form.submit()) goBack();
  }

  async function handleRemove() {
    if (await form.remove()) goBack();
  }

  return (
    <div
      style={overlayStyle}
      role="dialog"
      aria-modal="true"
      aria-labelledby="class-sheet-title"
    >
      <form style={sheetStyle} onSubmit={(e) => void handleSubmit(e)}>
        <div style={headerStyle}>
          <h2
            ref={headingRef}
            tabIndex={-1}
            id="class-sheet-title"
            style={{ margin: 0, fontSize: 18 }}
          >
            {classDto ? 'Занятие' : 'Новое занятие'}
          </h2>
          <Button type="button" variant="secondary" onClick={goBack}>
            Закрыть
          </Button>
        </div>

        <ClassFormFields
          state={form.state}
          setField={form.setField}
          error={form.validationError}
        />
        <RuleFields
          rules={form.state.rules}
          onChange={(rules) => form.setField('rules', rules)}
        />

        {form.serverError && (
          <div role="alert" style={{ color: 'var(--danger)' }}>
            <p style={{ margin: 0 }}>{form.serverError.message}</p>
            {form.serverError.details && (
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {form.serverError.details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <Button type="submit" pending={form.pending} disabled={noRules}>
            Сохранить
          </Button>
          {classDto && (
            <Button
              type="button"
              variant="danger"
              pending={form.pending}
              onClick={() => void handleRemove()}
            >
              Удалить
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
