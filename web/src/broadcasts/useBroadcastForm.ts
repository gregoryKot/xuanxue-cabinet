// Оркестрация листа «Новая рассылка» — состояние и отправка, по образцу
// schedule/useClassForm.ts. `pending` блокирует повторный клик «Отправить»
// внутри одного вызова; `idempotencyKey` защищает и от повтора снаружи
// (двойной клик по двум разным событиям, ретрай сети — CLAUDE.md «API»):
// ключ на форму, не на попытку — при ошибке он не меняется, чтобы повтор
// после сбоя тоже считался тем же запросом.
import { useState } from 'react';
import type { CreateBroadcastInput } from '@xuanxue/shared';
import { errorFrom, type FormError } from '../components/FormServerError';
import {
  initialBroadcastFormState,
  toCreateInput,
  validateBroadcastForm,
  type BroadcastFormError,
  type BroadcastFormState,
} from './broadcastFormInput';

export interface UseBroadcastFormResult {
  state: BroadcastFormState;
  setField: <K extends keyof BroadcastFormState>(
    key: K,
    value: BroadcastFormState[K],
  ) => void;
  validationError: BroadcastFormError | null;
  serverError: FormError | null;
  pending: boolean;
  submit: () => Promise<boolean>;
}

export function useBroadcastForm(
  onCreate: (input: CreateBroadcastInput) => Promise<void>,
): UseBroadcastFormResult {
  const [state, setState] = useState<BroadcastFormState>(initialBroadcastFormState);
  const [validationError, setValidationError] = useState<BroadcastFormError | null>(null);
  const [serverError, setServerError] = useState<FormError | null>(null);
  const [pending, setPending] = useState(false);
  // Ленивый инициализатор — один ключ на открытие формы, не на каждый рендер.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  function setField<K extends keyof BroadcastFormState>(
    key: K,
    value: BroadcastFormState[K],
  ) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(): Promise<boolean> {
    if (pending) return false;
    const invalid = validateBroadcastForm(state);
    setValidationError(invalid);
    if (invalid) return false;

    setServerError(null);
    setPending(true);
    try {
      await onCreate({ ...toCreateInput(state), idempotencyKey });
      // Успех — форма готова к следующей независимой отправке новым ключом;
      // при ошибке ключ остаётся тем же (повтор — тот же запрос, не новый).
      setIdempotencyKey(crypto.randomUUID());
      return true;
    } catch (err) {
      setServerError(errorFrom(err, 'Не удалось отправить. Попробуйте ещё раз.'));
      return false;
    } finally {
      setPending(false);
    }
  }

  return { state, setField, validationError, serverError, pending, submit };
}
