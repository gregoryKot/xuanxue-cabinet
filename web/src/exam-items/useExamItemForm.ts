// Оркестрация формы вопроса — состояние, валидация и сборка тела запроса в
// examItemFormInput.ts (чистая логика, тестируется без React); здесь только
// связка с submit/remove/changeStatus и их сетевыми ошибками, по образцу
// schedule/useClassForm.ts. changeStatus — отдельное действие (кнопка, а не
// часть «Сохранить»): меняет только status, не задевая поля формы.
import { useState } from 'react';
import type {
  CreateExamItemInput,
  ExamItemDto,
  ExamItemStatus,
  UpdateExamItemInput,
} from '@xuanxue/shared';
import { errorFrom, type FormError } from '../components/FormServerError';
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

export interface UseExamItemFormResult {
  state: ExamItemFormState;
  setField: <K extends keyof ExamItemFormState>(
    key: K,
    value: ExamItemFormState[K],
  ) => void;
  validationError: string | null;
  serverError: FormError | null;
  pending: boolean;
  submit: () => Promise<boolean>;
  remove: () => Promise<boolean>;
  changeStatus: (status: ExamItemStatus) => Promise<boolean>;
}

export function useExamItemForm(
  item: ExamItemDto | null,
  onCreate: (input: CreateExamItemInput) => Promise<void>,
  onUpdate: (id: string, input: UpdateExamItemInput) => Promise<void>,
  onRemove: (id: string) => Promise<void>,
): UseExamItemFormResult {
  const [state, setState] = useState<ExamItemFormState>(() =>
    initialExamItemFormState(item),
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<FormError | null>(null);
  const [pending, setPending] = useState(false);

  function setField<K extends keyof ExamItemFormState>(
    key: K,
    value: ExamItemFormState[K],
  ) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(): Promise<boolean> {
    const invalid = validateExamItemForm(state);
    setValidationError(invalid);
    if (invalid) return false;

    setServerError(null);
    setPending(true);
    try {
      if (item) await onUpdate(item.id, toUpdateInput(state));
      else await onCreate(toCreateInput(state));
      return true;
    } catch (err) {
      setServerError(errorFrom(err, SAVE_ERROR_MESSAGE));
      return false;
    } finally {
      setPending(false);
    }
  }

  async function remove(): Promise<boolean> {
    if (!item) return false;
    setServerError(null);
    setPending(true);
    try {
      await onRemove(item.id);
      return true;
    } catch (err) {
      setServerError(errorFrom(err, REMOVE_ERROR_MESSAGE));
      return false;
    } finally {
      setPending(false);
    }
  }

  async function changeStatus(status: ExamItemStatus): Promise<boolean> {
    if (!item) return false;
    setServerError(null);
    setPending(true);
    try {
      await onUpdate(item.id, { status });
      return true;
    } catch (err) {
      setServerError(errorFrom(err, STATUS_ERROR_MESSAGE));
      return false;
    } finally {
      setPending(false);
    }
  }

  return {
    state,
    setField,
    validationError,
    serverError,
    pending,
    submit,
    remove,
    changeStatus,
  };
}
