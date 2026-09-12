// Оркестрация формы create/update/delete/смена статуса — одна механика для
// вопроса банка (exam-items/useExamItemForm.ts) и формы экзамена
// (exams/useExamForm.ts, ТЗ 4.3): submit/remove/changeStatus, ошибки сервера
// и `pending` устроены одинаково у обоих, второй домен скопировал бы хук
// целиком (CLAUDE.md «Одна механика — один компонент», jscpd). Валидация и
// сборка тела запроса остаются в чистой логике домена (examItemFormInput.ts/
// examFormInput.ts) — здесь только связка с сетевыми колбэками.
import { useState } from 'react';
import { errorFrom, type FormError } from '../components/FormServerError';

export interface UseEntityFormConfig<
  TEntity,
  TFormState,
  TCreateInput,
  TUpdateInput extends { status?: TStatus },
  TStatus extends string,
> {
  entity: TEntity | null;
  getId: (entity: TEntity) => string;
  initialState: (entity: TEntity | null) => TFormState;
  validate: (state: TFormState) => string | null;
  toCreateInput: (state: TFormState) => TCreateInput;
  toUpdateInput: (state: TFormState) => TUpdateInput;
  onCreate: (input: TCreateInput) => Promise<void>;
  onUpdate: (id: string, input: TUpdateInput) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  saveErrorMessage: string;
  removeErrorMessage: string;
  statusErrorMessage: string;
}

export interface UseEntityFormResult<TFormState, TStatus extends string> {
  state: TFormState;
  setField: <K extends keyof TFormState>(key: K, value: TFormState[K]) => void;
  validationError: string | null;
  serverError: FormError | null;
  pending: boolean;
  submit: () => Promise<boolean>;
  remove: () => Promise<boolean>;
  changeStatus: (status: TStatus) => Promise<boolean>;
}

export function useEntityForm<
  TEntity,
  TFormState,
  TCreateInput,
  TUpdateInput extends { status?: TStatus },
  TStatus extends string,
>(
  config: UseEntityFormConfig<TEntity, TFormState, TCreateInput, TUpdateInput, TStatus>,
): UseEntityFormResult<TFormState, TStatus> {
  const { entity } = config;
  const [state, setState] = useState<TFormState>(() => config.initialState(entity));
  const [validationError, setValidationError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<FormError | null>(null);
  const [pending, setPending] = useState(false);

  function setField<K extends keyof TFormState>(key: K, value: TFormState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(): Promise<boolean> {
    const invalid = config.validate(state);
    setValidationError(invalid);
    if (invalid) return false;

    setServerError(null);
    setPending(true);
    try {
      if (entity)
        await config.onUpdate(config.getId(entity), config.toUpdateInput(state));
      else await config.onCreate(config.toCreateInput(state));
      return true;
    } catch (err) {
      setServerError(errorFrom(err, config.saveErrorMessage));
      return false;
    } finally {
      setPending(false);
    }
  }

  async function remove(): Promise<boolean> {
    if (!entity) return false;
    setServerError(null);
    setPending(true);
    try {
      await config.onRemove(config.getId(entity));
      return true;
    } catch (err) {
      setServerError(errorFrom(err, config.removeErrorMessage));
      return false;
    } finally {
      setPending(false);
    }
  }

  async function changeStatus(status: TStatus): Promise<boolean> {
    if (!entity) return false;
    setServerError(null);
    setPending(true);
    try {
      // Cast обоснован конкретными доменами: у UpdateExamItemInput/UpdateExamInput
      // все поля опциональны, `{ status }` — валидное значение обоих типов;
      // обобщённый TUpdateInput этого структурно не знает.
      await config.onUpdate(config.getId(entity), { status } as TUpdateInput);
      return true;
    } catch (err) {
      setServerError(errorFrom(err, config.statusErrorMessage));
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
