// Быстрое создание вопроса прямо в редакторе экзамена (ADR-0040 — владелец
// просил заводить вопрос там, где он нужен, без ухода в «Вопросы» и обратно).
// Состояние, валидация и сборка тела запроса — те же, что у страницы вопроса
// (exam-items/examItemFormInput.ts, CLAUDE.md «Одна механика — один
// компонент»): здесь только сохранение и возврат созданной записи, чтобы
// вызывающий сразу добавил её в список экзамена.
import { useState } from 'react';
import type { CreateExamItemInput, ExamItemDto } from '@xuanxue/shared';
import { EXAM_ITEMS_PATH } from '../api/apiPaths';
import { apiFetch } from '../api/http';
import { errorFrom, type FormError } from '../components/FormServerError';
import {
  initialExamItemFormState,
  toCreateInput,
  validateExamItemForm,
  type ExamItemFormState,
} from '../exam-items/examItemFormInput';

const SAVE_ERROR_MESSAGE = 'Не удалось сохранить вопрос. Попробуйте ещё раз.';

export interface UseNewQuestionFormResult {
  state: ExamItemFormState;
  setField: <K extends keyof ExamItemFormState>(
    key: K,
    value: ExamItemFormState[K],
  ) => void;
  validationError: string | null;
  serverError: FormError | null;
  pending: boolean;
  /** `null` — форма не прошла валидацию или сервер отказал; ошибка уже
   * выставлена в `validationError`/`serverError`, форма остаётся открытой. */
  submit: () => Promise<ExamItemDto | null>;
}

export function useNewQuestionForm(): UseNewQuestionFormResult {
  const [state, setState] = useState<ExamItemFormState>(() =>
    initialExamItemFormState(null),
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

  async function submit(): Promise<ExamItemDto | null> {
    const invalid = validateExamItemForm(state);
    setValidationError(invalid);
    if (invalid) return null;

    setServerError(null);
    setPending(true);
    try {
      const input: CreateExamItemInput = toCreateInput(state);
      return await apiFetch<ExamItemDto>(EXAM_ITEMS_PATH, {
        method: 'POST',
        body: input,
      });
    } catch (err) {
      setServerError(errorFrom(err, SAVE_ERROR_MESSAGE));
      return null;
    } finally {
      setPending(false);
    }
  }

  return { state, setField, validationError, serverError, pending, submit };
}
