// Оркестрация формы экзамена — состояние, валидация и сборка тела запроса в
// examFormInput.ts (чистая логика, тестируется без React); submit/remove/
// changeStatus — общая механика с формой вопроса (hooks/useEntityForm.ts,
// exam-items/useExamItemForm.ts), здесь только конфигурация под домен формы.
import type {
  CreateExamInput,
  ExamDto,
  ExamStatus,
  UpdateExamInput,
} from '@xuanxue/shared';
import { useEntityForm, type UseEntityFormResult } from '../hooks/useEntityForm';
import {
  initialExamFormState,
  toCreateInput,
  toUpdateInput,
  validateExamForm,
  type ExamFormState,
} from './examFormInput';

const SAVE_ERROR_MESSAGE = 'Не удалось сохранить. Попробуйте ещё раз.';
const REMOVE_ERROR_MESSAGE = 'Не удалось удалить. Попробуйте ещё раз.';
const STATUS_ERROR_MESSAGE = 'Не удалось изменить статус. Попробуйте ещё раз.';
// Домен черновика (lib/formDraft.ts, ADR-0046): xuanxue.draft.exam:new для
// нового экзамена, xuanxue.draft.exam:<id> для существующего.
const DRAFT_DOMAIN = 'exam';

export type UseExamFormResult = UseEntityFormResult<ExamFormState, ExamStatus>;

export function useExamForm(
  exam: ExamDto | null,
  onCreate: (input: CreateExamInput) => Promise<void>,
  onUpdate: (id: string, input: UpdateExamInput) => Promise<void>,
  onRemove: (id: string) => Promise<void>,
): UseExamFormResult {
  return useEntityForm({
    entity: exam,
    getId: (e) => e.id,
    initialState: initialExamFormState,
    validate: validateExamForm,
    toCreateInput,
    // `id` первого блока живёт в самом экзамене, не в состоянии формы: иначе
    // экран пересобирал бы блок заново при каждом сохранении (ADR-0033).
    toUpdateInput: (state) => toUpdateInput(state, exam),
    onCreate,
    onUpdate,
    onRemove,
    saveErrorMessage: SAVE_ERROR_MESSAGE,
    removeErrorMessage: REMOVE_ERROR_MESSAGE,
    statusErrorMessage: STATUS_ERROR_MESSAGE,
    draftKey: `${DRAFT_DOMAIN}:${exam?.id ?? 'new'}`,
  });
}
