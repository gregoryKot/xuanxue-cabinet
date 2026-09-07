// Оркестрация формы занятия — состояние, валидация и сборка тела запроса в
// classFormInput.ts (чистая логика, тестируется без React); здесь только
// связка с submit/remove и их сетевыми ошибками.
import { useState } from 'react';
import type { ClassDto, CreateClassInput, UpdateClassInput } from '@xuanxue/shared';
import { errorFrom, type FormError } from '../components/FormServerError';
import {
  initialClassFormState,
  toCreateInput,
  toUpdateInput,
  validateClassForm,
  type ClassFormState,
} from './classFormInput';

export interface UseClassFormResult {
  state: ClassFormState;
  setField: <K extends keyof ClassFormState>(key: K, value: ClassFormState[K]) => void;
  validationError: string | null;
  serverError: FormError | null;
  pending: boolean;
  submit: () => Promise<boolean>;
  remove: () => Promise<boolean>;
}

export function useClassForm(
  classDto: ClassDto | null,
  onCreate: (input: CreateClassInput) => Promise<void>,
  onUpdate: (id: string, input: UpdateClassInput) => Promise<void>,
  onRemove: (id: string) => Promise<void>,
): UseClassFormResult {
  const [state, setState] = useState<ClassFormState>(() =>
    initialClassFormState(classDto),
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<FormError | null>(null);
  const [pending, setPending] = useState(false);

  function setField<K extends keyof ClassFormState>(key: K, value: ClassFormState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(): Promise<boolean> {
    const invalid = validateClassForm(state);
    setValidationError(invalid);
    if (invalid) return false;

    setServerError(null);
    setPending(true);
    try {
      if (classDto) await onUpdate(classDto.id, toUpdateInput(state));
      else await onCreate(toCreateInput(state));
      return true;
    } catch (err) {
      setServerError(errorFrom(err, 'Не удалось сохранить. Попробуйте ещё раз.'));
      return false;
    } finally {
      setPending(false);
    }
  }

  async function remove(): Promise<boolean> {
    if (!classDto) return false;
    setServerError(null);
    setPending(true);
    try {
      await onRemove(classDto.id);
      return true;
    } catch (err) {
      setServerError(errorFrom(err, 'Не удалось удалить. Попробуйте ещё раз.'));
      return false;
    } finally {
      setPending(false);
    }
  }

  return { state, setField, validationError, serverError, pending, submit, remove };
}
