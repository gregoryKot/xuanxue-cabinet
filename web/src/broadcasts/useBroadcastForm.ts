// Оркестрация листа «Новая рассылка» — состояние и отправка, по образцу
// schedule/useClassForm.ts. `pending` блокирует повторный клик «Отправить»
// внутри одного вызова; `idempotencyKey` защищает и от повтора снаружи
// (двойной клик по двум разным событиям, ретрай сети — CLAUDE.md «API»):
// ключ на форму, не на попытку — при ошибке он не меняется, чтобы повтор
// после сбоя тоже считался тем же запросом.
//
// Черновик (ADR-0052, дополнение 2026-09-21) — напрямую через
// hooks/useFormDraft.ts, не через hooks/useEntityForm.ts: у листа нет
// сущности с create/update/remove, только одна отправка, а
// `idempotencyKey` — часть состояния хука, не формы, и в черновик не
// попадает. Ключ один на страницу (`broadcast:new`, не по id): у разовой
// рассылки нет отдельного адреса редактирования, второй такой формы не
// бывает. Раньше черновика не было вовсе — длинный текст поста пропадал при
// случайном «Назад» (аудит 2026-09-21, HIGH).
import { useState } from 'react';
import type { CreateBroadcastInput } from '@xuanxue/shared';
import { errorFrom, type FormError } from '../components/FormServerError';
import { useFormDraft } from '../hooks/useFormDraft';
import {
  initialBroadcastFormState,
  toCreateInput,
  validateBroadcastForm,
  type BroadcastFormError,
  type BroadcastFormState,
} from './broadcastFormInput';

const DRAFT_KEY = 'broadcast:new';

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
  draftRestored: boolean;
  discardDraft: () => void;
}

export function useBroadcastForm(
  onCreate: (input: CreateBroadcastInput) => Promise<void>,
): UseBroadcastFormResult {
  const draft = useFormDraft<BroadcastFormState>(DRAFT_KEY, initialBroadcastFormState);
  const { state, setState } = draft;
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
      draft.forgetDraft();
      return true;
    } catch (err) {
      setServerError(errorFrom(err, 'Не удалось отправить. Попробуйте ещё раз.'));
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
    draftRestored: draft.restored,
    discardDraft: draft.discardDraft,
  };
}
