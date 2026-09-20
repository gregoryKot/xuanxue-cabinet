// «Добавить ссылку» на странице даты занятия (ADR-0056): материал заводится
// там, где он нужен, и сразу привязывается к этой дате — `lessonIds` уходит
// в том же POST, вторым запросом привязку не делаем (иначе при сбое второго
// материал остался бы в библиотеке ничей).
//
// Состояние, валидация и сборка тела — общие со страницей материала
// (materials/materialFormInput.ts): полей в форме меньше, но те, что есть,
// проверяются теми же правилами (CLAUDE.md «Одна механика — один компонент»).
import { useCallback, useState } from 'react';
import type { CreateMaterialInput, MaterialDto } from '@xuanxue/shared';
import { MATERIALS_PATH } from '../api/apiPaths';
import { apiFetch } from '../api/http';
import { errorFrom, type FormError } from '../components/FormServerError';
import {
  initialMaterialFormState,
  toCreateInput,
  validateMaterialForm,
  type MaterialFormError,
  type MaterialFormState,
} from '../materials/materialFormInput';

const SAVE_ERROR_MESSAGE = 'Не удалось сохранить материал. Попробуйте ещё раз.';

export interface UseNewLessonMaterialFormResult {
  state: MaterialFormState;
  setField: <K extends keyof MaterialFormState>(
    key: K,
    value: MaterialFormState[K],
  ) => void;
  validationError: MaterialFormError | null;
  serverError: FormError | null;
  pending: boolean;
  /** `false` — форма не прошла проверку или сервер отказал; ошибка уже стоит
   * под полем или под формой, сама форма остаётся открытой с набранным. */
  submit: () => Promise<boolean>;
}

export function useNewLessonMaterialForm(
  lessonId: string,
): UseNewLessonMaterialFormResult {
  const [state, setState] = useState<MaterialFormState>(() =>
    initialMaterialFormState(null),
  );
  const [validationError, setValidationError] = useState<MaterialFormError | null>(null);
  const [serverError, setServerError] = useState<FormError | null>(null);
  const [pending, setPending] = useState(false);

  const setField = useCallback(
    <K extends keyof MaterialFormState>(key: K, value: MaterialFormState[K]) => {
      setState((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const submit = useCallback(async (): Promise<boolean> => {
    const invalid = validateMaterialForm(state);
    setValidationError(invalid);
    if (invalid) return false;

    setServerError(null);
    setPending(true);
    try {
      const input: CreateMaterialInput = {
        ...toCreateInput(state),
        lessonIds: [lessonId],
      };
      await apiFetch<MaterialDto>(MATERIALS_PATH, { method: 'POST', body: input });
      return true;
    } catch (err) {
      setServerError(errorFrom(err, SAVE_ERROR_MESSAGE));
      return false;
    } finally {
      setPending(false);
    }
  }, [state, lessonId]);

  return { state, setField, validationError, serverError, pending, submit };
}
