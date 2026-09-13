// Лист создания/правки вопроса — по образцу schedule/ClassSheet.tsx
// (useHistorySheet/useDialog, «Назад» браузера закрывает лист, а не уводит из
// приложения). Форма/валидация — useExamItemForm, здесь только разметка и
// подключение хуков.
import type { FormEvent } from 'react';
import type {
  CreateExamItemInput,
  ExamItemDto,
  ExamItemStatus,
  UpdateExamItemInput,
} from '@xuanxue/shared';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FormServerError } from '../components/FormServerError';
import { SheetShell } from '../components/SheetShell';
import { useConfirmedRemove } from '../hooks/useConfirmedRemove';
import { useDialog } from '../hooks/useDialog';
import { useHistorySheet } from '../hooks/useHistorySheet';
import { ExamItemFormFields } from './ExamItemFormFields';
import { ExamItemOptionsField } from './ExamItemOptionsField';
import { ExamItemStatusControls } from './ExamItemStatusControls';
import { hasOptions } from './examItemFormInput';
import { useExamItemForm } from './useExamItemForm';

// ТЗ 4.2 «Лист»: предупредить одной строкой до сохранения, без модального
// окна — правка содержательного поля опубликованного вопроса поднимает
// версию на сервере (ExamItemsService.update, exam-items.service.ts).
const VERSION_WARNING =
  'Правка обновит версию вопроса — прежняя формулировка останется в истории для уже сданных работ.';

interface ExamItemSheetProps {
  item: ExamItemDto | null;
  onClose: () => void;
  onCreate: (input: CreateExamItemInput) => Promise<void>;
  onUpdate: (id: string, input: UpdateExamItemInput) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}

export function ExamItemSheet({
  item,
  onClose,
  onCreate,
  onUpdate,
  onRemove,
}: ExamItemSheetProps) {
  const goBack = useHistorySheet(onClose);
  const { headingRef, containerRef } = useDialog(goBack);
  const form = useExamItemForm(item, onCreate, onUpdate, onRemove);
  const removeConfirm = useConfirmedRemove(form.remove, goBack);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (await form.submit()) goBack();
  }

  async function handleChangeStatus(status: ExamItemStatus) {
    if (await form.changeStatus(status)) goBack();
  }

  return (
    <>
      <SheetShell
        titleId="exam-item-sheet-title"
        title={item ? 'Вопрос' : 'Новый вопрос'}
        headingRef={headingRef}
        containerRef={containerRef}
        onSubmit={(e) => void handleSubmit(e)}
        onClose={goBack}
      >
        {item?.status === 'published' && (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-soft)' }}>
            {VERSION_WARNING}
          </p>
        )}

        <ExamItemFormFields
          state={form.state}
          setField={form.setField}
          error={form.validationError}
          isCreate={!item}
        />

        {hasOptions(form.state.kind) && (
          <ExamItemOptionsField
            kind={form.state.kind}
            options={form.state.options}
            onChange={(options) => form.setField('options', options)}
          />
        )}

        <FormServerError error={form.serverError} />

        <Button type="submit" pending={form.pending}>
          Сохранить
        </Button>

        {item && (
          <ExamItemStatusControls
            status={item.status}
            pending={form.pending}
            onChangeStatus={(status) => void handleChangeStatus(status)}
            onRemove={removeConfirm.requestRemove}
          />
        )}
      </SheetShell>

      {removeConfirm.confirming && (
        <ConfirmDialog
          title="Удалить вопрос?"
          message="Черновик вопроса исчезнет вместе с формулировкой и вариантами ответа. Отменить нельзя."
          confirmLabel="Удалить"
          pending={form.pending}
          onConfirm={removeConfirm.confirmRemove}
          onCancel={removeConfirm.cancelRemove}
        />
      )}
    </>
  );
}
