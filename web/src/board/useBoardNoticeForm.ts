// Логика формы объявления ученикам: текст и последний день показа
// (shared/src/board.ts, ADR-0172). Живёт на доске штата (StaffBoardNotice.tsx,
// BoardNoticeDialog.tsx; до 2026-10-07 — раздел «Доска» экрана «Шаблоны», где
// объявление никто не находил, ADR-0172 дополнение). Текст и срок — одно
// объявление, поэтому сохраняются вместе одним PATCH (`boardNotice` заменяется
// целиком). Механика та же, что у полей «Шаблонов» (useSettingsTextField.ts,
// usePaymentReminderSection.ts): черновик и сверка с сохранённым по
// `settings.updatedAt` (templates/useSavedDraft.ts), ошибка сервера через
// FormError. Пустой текст — явный сброс (`null`): объявления нет, срок без
// текста ничего не значит.
import { useState } from 'react';
import type { SettingsDto, UpdateSettingsInput } from '@xuanxue/shared';
import { errorFrom, type FormError } from '../components/FormServerError';
import { useSavedDraft } from '../templates/useSavedDraft';

const SAVE_ERROR = 'Не удалось сохранить объявление. Попробуйте ещё раз.';
const UNTIL_REQUIRED_ERROR = 'Укажите, до какого дня показывать';

// `type`, не `interface`: useSavedDraft.ts принимает плоскую запись.
type FormState = {
  text: string;
  /** 'YYYY-MM-DD' — значение `<input type="date">`; пустая строка — не выбрано. */
  until: string;
};

function savedForm(settings: SettingsDto | null): FormState {
  return {
    text: settings?.boardNotice?.text ?? '',
    until: settings?.boardNotice?.until ?? '',
  };
}

export interface UseBoardNoticeFormResult {
  form: FormState;
  setText: (text: string) => void;
  setUntil: (until: string) => void;
  hasChanges: boolean;
  pending: boolean;
  /** Ошибка формы (нет срока) или сервера — одним полем, показывается под кнопкой. */
  error: FormError | null;
  /** `true` — сохранено, диалог можно закрыть; `false` — ошибка формы или
   * сервера уже показана в `error`, диалог остаётся открытым. */
  save: () => Promise<boolean>;
}

export function useBoardNoticeForm(
  settings: SettingsDto | null,
  update: (input: UpdateSettingsInput) => Promise<void>,
): UseBoardNoticeFormResult {
  const saved = savedForm(settings);
  const [form, setForm, submit] = useSavedDraft(saved, settings?.updatedAt);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<FormError | null>(null);

  const trimmed = form.text.trim();
  // Пустой текст при пустом сохранённом — менять нечего, даже если выбрали дату:
  // объявления без текста не бывает.
  const hasChanges =
    trimmed === ''
      ? saved.text !== ''
      : trimmed !== saved.text || form.until !== saved.until;

  // Правка сбрасывает показанную ошибку: она про прошлое состояние формы.
  function edit(patch: Partial<FormState>): void {
    setError(null);
    setForm((prev) => ({ ...prev, ...patch }));
  }

  async function save(): Promise<boolean> {
    if (pending || !hasChanges) return false;
    if (trimmed !== '' && form.until === '') {
      setError({ message: UNTIL_REQUIRED_ERROR });
      return false;
    }
    setPending(true);
    setError(null);
    const boardNotice = trimmed === '' ? null : { text: trimmed, until: form.until };
    try {
      await submit(form, () => update({ boardNotice }));
      return true;
    } catch (err) {
      setError(errorFrom(err, SAVE_ERROR));
      return false;
    } finally {
      setPending(false);
    }
  }

  return {
    form,
    setText: (text) => edit({ text }),
    setUntil: (until) => edit({ until }),
    hasChanges,
    pending,
    error,
    save,
  };
}
