// Оркестрация формы вопроса — состояние, валидация и сборка тела запроса в
// examItemFormInput.ts (чистая логика, тестируется без React); submit/remove/
// changeStatus — общая механика с формой экзамена (hooks/useEntityForm.ts,
// exams/useExamForm.ts), здесь только конфигурация под домен вопроса.
import type {
  CreateExamItemInput,
  ExamItemDto,
  ExamItemStatus,
  UpdateExamItemInput,
} from '@xuanxue/shared';
import { useEntityForm, type UseEntityFormResult } from '../hooks/useEntityForm';
import {
  initialExamItemFormState,
  toCreateInput,
  toUpdateInput,
  validateExamItemForm,
  type ExamItemFormState,
} from './examItemFormInput';

const SAVE_ERROR_MESSAGE = 'Не удалось сохранить. Попробуйте ещё раз.';
const REMOVE_ERROR_MESSAGE = 'Не удалось удалить. Попробуйте ещё раз.';
const STATUS_ERROR_MESSAGE = 'Не удалось изменить статус. Попробуйте ещё раз.';

export type UseExamItemFormResult = UseEntityFormResult<
  ExamItemFormState,
  ExamItemStatus
>;

export function useExamItemForm(
  item: ExamItemDto | null,
  onCreate: (input: CreateExamItemInput) => Promise<void>,
  onUpdate: (id: string, input: UpdateExamItemInput) => Promise<void>,
  onRemove: (id: string) => Promise<void>,
): UseExamItemFormResult {
  return useEntityForm({
    entity: item,
    getId: (i) => i.id,
    initialState: initialExamItemFormState,
    validate: validateExamItemForm,
    toCreateInput,
    toUpdateInput,
    onCreate,
    onUpdate,
    onRemove,
    saveErrorMessage: SAVE_ERROR_MESSAGE,
    removeErrorMessage: REMOVE_ERROR_MESSAGE,
    statusErrorMessage: STATUS_ERROR_MESSAGE,
  });
}
