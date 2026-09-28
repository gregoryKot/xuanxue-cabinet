// Оркестрация формы create/update/delete/смена статуса — одна механика для
// сущности со статусом (вопрос, exam-items/useExamItemForm.ts; экзамен,
// exams/useExamForm.ts, ТЗ 4.3) и без него (канал, channels/useChannelForm.ts;
// материал, materials/useMaterialForm.ts, слой 3.2 docs/PLAN.md §14):
// submit/remove, ошибки сервера и `pending` устроены одинаково у всех
// четырёх, второй домен скопировал бы хук целиком (CLAUDE.md «Одна механика —
// один компонент», jscpd). Валидация и сборка тела запроса остаются в чистой
// логике домена (examItemFormInput.ts/examFormInput.ts/channelFormInput.ts/
// materialFormInput.ts) — здесь только связка с сетевыми колбэками. Черновик
// (ADR-0052) — в useFormDraft.ts, иначе файл не уложится в 150 строк.
//
// `TStatus` по умолчанию `never`: у канала и материала статуса нет, и
// `changeStatus` у них недостижим по типу параметра, а `statusErrorMessage`
// в конфиге не нужен. `TError` — тип ошибки валидации: строка на один общий
// алерт (вопрос, экзамен) или `{ field, message }` под конкретным полем
// (канал, материал).
import { useState } from 'react';
import { errorFrom, type FormError } from '../components/FormServerError';
import { useFormDraft } from './useFormDraft';

export interface UseEntityFormConfig<
  TEntity,
  TFormState,
  TCreateInput,
  TUpdateInput,
  TStatus extends string = never,
  TError = string,
> {
  entity: TEntity | null;
  getId: (entity: TEntity) => string;
  initialState: (entity: TEntity | null) => TFormState;
  validate: (state: TFormState) => TError | null;
  toCreateInput: (state: TFormState) => TCreateInput;
  toUpdateInput: (state: TFormState) => TUpdateInput;
  /** Тело запроса при смене статуса — то же, что у «Сохранить», плюс новый
   * статус. Отдельным полем, а не `{ ...toUpdateInput(state), status }` внутри
   * хука: тип тела задаёт домен, и у канала с материалом поля `status` нет
   * вовсе — общий спред пришлось бы приводить типом. Нет поля — нет и смены
   * статуса (`TStatus` тогда `never`, и `changeStatus` недостижим). */
  toStatusInput?: (state: TFormState, status: TStatus) => TUpdateInput;
  onCreate: (input: TCreateInput) => Promise<unknown>; // ADR-0134: материалу нужна созданная запись
  onUpdate: (id: string, input: TUpdateInput) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  saveErrorMessage: string;
  removeErrorMessage: string;
  /** Не задано — сущность без статуса, `changeStatus` не вызывается. */
  statusErrorMessage?: string;
  draftKey: string | null; // null — форма без черновика, осознанно (ADR-0052)
}

export interface UseEntityFormResult<
  TFormState,
  TStatus extends string = never,
  TError = string,
> {
  state: TFormState;
  setField: <K extends keyof TFormState>(key: K, value: TFormState[K]) => void;
  validationError: TError | null;
  serverError: FormError | null;
  pending: boolean;
  /** `next` — состояние, собранное в том же обработчике до отрисовки своего
   * `setField` (экзамен + только что сохранённый вопрос, usePendingQuestion). */
  submit: (next?: TFormState) => Promise<boolean>;
  remove: () => Promise<boolean>;
  changeStatus: (status: TStatus, next?: TFormState) => Promise<boolean>;
  draftRestored: boolean;
  discardDraft: () => void;
}

export function useEntityForm<
  TEntity,
  TFormState,
  TCreateInput,
  TUpdateInput,
  TStatus extends string = never,
  TError = string,
>(
  config: UseEntityFormConfig<
    TEntity,
    TFormState,
    TCreateInput,
    TUpdateInput,
    TStatus,
    TError
  >,
): UseEntityFormResult<TFormState, TStatus, TError> {
  const { entity } = config;
  const draft = useFormDraft(config.draftKey, () => config.initialState(entity));
  const { state, setState } = draft;
  const [validationError, setValidationError] = useState<TError | null>(null);
  const [serverError, setServerError] = useState<FormError | null>(null);
  const [pending, setPending] = useState(false);

  function setField<K extends keyof TFormState>(key: K, value: TFormState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(next: TFormState = state): Promise<boolean> {
    const invalid = config.validate(next);
    setValidationError(invalid);
    if (invalid) return false;

    setServerError(null);
    setPending(true);
    try {
      if (entity) await config.onUpdate(config.getId(entity), config.toUpdateInput(next));
      else await config.onCreate(config.toCreateInput(next));
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

  async function changeStatus(
    status: TStatus,
    next: TFormState = state,
  ): Promise<boolean> {
    if (!entity || !config.toStatusInput) return false;

    // Кнопка статуса обещает одно действие, не «сохраните, потом нажмите
    // сюда»: раньше уходил только `{ status }`, и правки формы молча
    // пропадали (аудит 2026-09-15, блокер №1). Теперь — то же тело и та же
    // валидация, что у «Сохранить» (toUpdateInput), плюс статус поверх.
    const invalid = config.validate(next);
    setValidationError(invalid);
    if (invalid) return false;

    setServerError(null);
    setPending(true);
    try {
      await config.onUpdate(config.getId(entity), config.toStatusInput(next, status));
      draft.forgetDraft();
      return true;
    } catch (err) {
      // Статуса у сущности может не быть — тогда сюда не попадают (`??`).
      setServerError(
        errorFrom(err, config.statusErrorMessage ?? config.saveErrorMessage),
      );
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
