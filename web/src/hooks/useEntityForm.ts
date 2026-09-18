// Оркестрация формы create/update/delete/смена статуса — одна механика для
// вопроса (exam-items/useExamItemForm.ts) и формы экзамена
// (exams/useExamForm.ts, ТЗ 4.3): submit/remove/changeStatus, ошибки сервера
// и `pending` устроены одинаково у обоих, второй домен скопировал бы хук
// целиком (CLAUDE.md «Одна механика — один компонент», jscpd). Валидация и
// сборка тела запроса остаются в чистой логике домена (examItemFormInput.ts/
// examFormInput.ts) — здесь только связка с сетевыми колбэками. Черновик
// (ADR-0052) — в useFormDraft.ts, иначе файл не уложится в 150 строк.
import { useState } from 'react';
import { errorFrom, type FormError } from '../components/FormServerError';
import { useFormDraft } from './useFormDraft';

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
  draftKey: string | null; // null — форма без черновика, осознанно (ADR-0052)
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
  draftRestored: boolean;
  discardDraft: () => void;
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
  const draft = useFormDraft(config.draftKey, () => config.initialState(entity));
  const { state, setState } = draft;
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
      draft.forgetDraft();
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
      draft.forgetDraft();
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

    // Кнопка статуса («Опубликовать»/«В архив»/«Вернуть в черновик») обещает
    // одно действие, не «сохраните сами, а потом ещё раз нажмите сюда»:
    // раньше сюда уходил только `{ status }`, и лист закрывался как после
    // сохранения, молча выбрасывая всё, что учитель успел наменять в форме
    // (аудит 2026-09-15, блокер №1 — заново собранный экзамен публиковался с
    // прежними блоками, исправленный вопрос — с прежней формулировкой).
    // Теперь смена статуса — то же тело, что у «Сохранить» (toUpdateInput),
    // плюс новый статус поверх; валидация та же, что у «Сохранить» — незачем
    // публиковать заведомо невалидную форму отдельным запросом.
    const invalid = config.validate(state);
    setValidationError(invalid);
    if (invalid) return false;

    setServerError(null);
    setPending(true);
    try {
      await config.onUpdate(config.getId(entity), {
        ...config.toUpdateInput(state),
        status,
      });
      draft.forgetDraft();
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
    draftRestored: draft.restored,
    discardDraft: draft.discardDraft,
  };
}
