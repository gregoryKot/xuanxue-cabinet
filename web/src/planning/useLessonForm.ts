// Оркестрация листа занятия — состояние формы, сохранение и быстрые действия
// статуса (отменить/вернуть в расписание), по образцу schedule/useClassForm.ts.
// Логика поля/валидации/сборки тела запроса — в lessonFormInput.ts (тестируется
// без React).
import { useState } from 'react';
import type {
  ClassDto,
  CreateLessonInput,
  LessonDto,
  UpdateLessonInput,
} from '@xuanxue/shared';
import { errorFrom, type FormError } from '../components/FormServerError';
import {
  initialLessonFormState,
  toCreateInput,
  toUpdateInput,
  validateLessonForm,
  type LessonFormState,
} from './lessonFormInput';

export interface UseLessonFormResult {
  state: LessonFormState;
  setField: <K extends keyof LessonFormState>(key: K, value: LessonFormState[K]) => void;
  validationError: string | null;
  serverError: FormError | null;
  pending: boolean;
  submit: () => Promise<boolean>;
  cancelLesson: () => Promise<boolean>;
  restoreLesson: () => Promise<boolean>;
}

export function useLessonForm(
  lessonDto: LessonDto | null,
  classes: ClassDto[],
  onCreate: (input: CreateLessonInput) => Promise<void>,
  onUpdate: (id: string, input: UpdateLessonInput) => Promise<void>,
): UseLessonFormResult {
  const [state, setState] = useState<LessonFormState>(() =>
    initialLessonFormState(lessonDto, classes),
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<FormError | null>(null);
  const [pending, setPending] = useState(false);

  function setField<K extends keyof LessonFormState>(key: K, value: LessonFormState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(): Promise<boolean> {
    const invalid = validateLessonForm(state, !lessonDto);
    setValidationError(invalid);
    if (invalid) return false;

    setServerError(null);
    setPending(true);
    try {
      if (lessonDto) await onUpdate(lessonDto.id, toUpdateInput(state));
      else await onCreate(toCreateInput(state));
      return true;
    } catch (err) {
      setServerError(errorFrom(err, 'Не удалось сохранить. Попробуйте ещё раз.'));
      return false;
    } finally {
      setPending(false);
    }
  }

  // Текст ошибки — по действию, не общее «не удалось изменить статус»
  // (ревью п.15): пользователь жал конкретную кнопку («Отменить занятие» или
  // «Вернуть в расписание»), об этом действии и должен быть ответ.
  const STATUS_ERROR_MESSAGE: Record<'cancelled' | 'scheduled', string> = {
    cancelled: 'Не удалось отменить занятие. Попробуйте ещё раз.',
    scheduled: 'Не удалось вернуть занятие в расписание. Попробуйте ещё раз.',
  };

  async function setStatus(status: 'cancelled' | 'scheduled'): Promise<boolean> {
    if (!lessonDto) return false;
    setServerError(null);
    setPending(true);
    try {
      await onUpdate(lessonDto.id, { status });
      return true;
    } catch (err) {
      setServerError(errorFrom(err, STATUS_ERROR_MESSAGE[status]));
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
    cancelLesson: () => setStatus('cancelled'),
    restoreLesson: () => setStatus('scheduled'),
  };
}
