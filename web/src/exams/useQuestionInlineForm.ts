// Оркестрация формы вопроса, раскрытой на месте в редакторе экзамена —
// создание («Новый вопрос», ADR-0040) и правка уже выбранного вопроса
// (отзыв владельца 2026-09-27: «нельзя отредактировать вопрос после
// добавления»), один хук на оба режима (CLAUDE.md «Одна механика — один
// компонент»), было useNewQuestionForm.ts только под создание. Состояние,
// валидация и сборка тела запроса — те же, что у страницы вопроса
// (exam-items/examItemFormInput.ts); здесь только сохранение (POST при
// создании, PATCH при правке) и возврат сохранённой записи, чтобы вызывающий
// сразу обновил список экзамена (ADR-0087 — без перезапроса).
import { useState } from 'react';
import type {
  CreateExamItemInput,
  ExamItemDto,
  UpdateExamItemInput,
} from '@xuanxue/shared';
import { EXAM_ITEMS_PATH } from '../api/apiPaths';
import { apiFetch } from '../api/http';
import { errorFrom, type FormError } from '../components/FormServerError';
import {
  initialExamItemFormState,
  toCreateInput,
  toUpdateInput,
  validateExamItemForm,
  type ExamItemFormState,
} from '../exam-items/examItemFormInput';

const SAVE_ERROR_MESSAGE = 'Не удалось сохранить вопрос. Попробуйте ещё раз.';

export interface UseQuestionInlineFormResult {
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

/** `item` — `null` заводит новый вопрос (`POST /exam-items`); существующая
 * запись открывает её на правку (`PATCH /exam-items/:id`) — тип ответа
 * (`kind`) при этом не меняется, поле просто не входит в UpdateExamItemInput. */
export function useQuestionInlineForm(
  item: ExamItemDto | null,
): UseQuestionInlineFormResult {
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

  async function submit(): Promise<ExamItemDto | null> {
    const invalid = validateExamItemForm(state);
    setValidationError(invalid);
    if (invalid) return null;

    setServerError(null);
    setPending(true);
    try {
      if (item) {
        const input: UpdateExamItemInput = toUpdateInput(state);
        return await apiFetch<ExamItemDto>(`${EXAM_ITEMS_PATH}/${item.id}`, {
          method: 'PATCH',
          body: input,
        });
      }
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
