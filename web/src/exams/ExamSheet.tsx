// Лист создания/правки формы экзамена — по образцу
// exam-items/ExamItemSheet.tsx. Банк вопросов грузится один раз на весь лист
// (useExamItems без фильтров сервера — фильтр по тегу и статусу «опубликован»
// уже локальный, ExamItemPicker.tsx/examItemPickerFilter.ts): один запрос
// обслуживает и список для добавления, и подстановку названий в блоках, и
// предпросмотр.
import { useState, type FormEvent } from 'react';
import type {
  CreateExamInput,
  ExamDto,
  ExamStatus,
  UpdateExamInput,
} from '@xuanxue/shared';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FormServerError } from '../components/FormServerError';
import { SheetShell } from '../components/SheetShell';
import { useConfirmedRemove } from '../hooks/useConfirmedRemove';
import { useDialog } from '../hooks/useDialog';
import { useHistorySheet } from '../hooks/useHistorySheet';
import { useExamItems } from '../exam-items/useExamItems';
import { ExamBlocksField } from './ExamBlocksField';
import { ExamFormFields } from './ExamFormFields';
import { ExamPreview } from './ExamPreview';
import { ExamStatusControls } from './ExamStatusControls';
import { useExamForm } from './useExamForm';

const BANK_FILTERS = { status: '' as const, kind: '' as const, tag: '' };

interface ExamSheetProps {
  exam: ExamDto | null;
  onClose: () => void;
  onCreate: (input: CreateExamInput) => Promise<void>;
  onUpdate: (id: string, input: UpdateExamInput) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}

export function ExamSheet({
  exam,
  onClose,
  onCreate,
  onUpdate,
  onRemove,
}: ExamSheetProps) {
  const goBack = useHistorySheet(onClose);
  const { headingRef } = useDialog(goBack);
  const form = useExamForm(exam, onCreate, onUpdate, onRemove);
  const bank = useExamItems(BANK_FILTERS);
  const [previewOpen, setPreviewOpen] = useState(false);
  const removeConfirm = useConfirmedRemove(form.remove, goBack);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (await form.submit()) goBack();
  }

  async function handleChangeStatus(status: ExamStatus) {
    if (await form.changeStatus(status)) goBack();
  }

  return (
    <>
      <SheetShell
        titleId="exam-sheet-title"
        title={exam ? 'Экзамен' : 'Новый экзамен'}
        headingRef={headingRef}
        onSubmit={(e) => void handleSubmit(e)}
        onClose={goBack}
      >
        <ExamFormFields
          state={form.state}
          setField={form.setField}
          error={form.validationError}
        />

        <ExamBlocksField
          blocks={form.state.blocks}
          onChange={(blocks) => form.setField('blocks', blocks)}
          bankItems={bank.items}
          bankLoading={bank.loading}
          bankError={bank.error}
          onRetryBank={() => void bank.reload()}
          onPublishItem={(itemId) => void bank.update(itemId, { status: 'published' })}
        />

        <Button type="button" variant="secondary" onClick={() => setPreviewOpen(true)}>
          Посмотреть глазами ученика
        </Button>

        <FormServerError error={form.serverError} />

        <Button type="submit" pending={form.pending}>
          Сохранить
        </Button>

        {exam && (
          <ExamStatusControls
            status={exam.status}
            pending={form.pending}
            onChangeStatus={(status) => void handleChangeStatus(status)}
            onRemove={removeConfirm.requestRemove}
          />
        )}

        {previewOpen && (
          <ExamPreview
            title={form.state.title}
            description={form.state.description}
            blocks={form.state.blocks}
            bankItems={bank.items ?? []}
            bankLoading={bank.loading}
            onClose={() => setPreviewOpen(false)}
          />
        )}
      </SheetShell>

      {removeConfirm.confirming && (
        <ConfirmDialog
          title="Удалить форму?"
          message="Форма исчезнет вместе со всеми блоками и вопросами в них. Отменить нельзя."
          confirmLabel="Удалить"
          pending={form.pending}
          onConfirm={removeConfirm.confirmRemove}
          onCancel={removeConfirm.cancelRemove}
        />
      )}
    </>
  );
}
