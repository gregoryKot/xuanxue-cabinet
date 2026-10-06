// Логика раздела «Доска» экрана «Шаблоны»: объявление ученикам и последний день
// показа (shared/src/board.ts, ADR-0172). Текст и срок — одно объявление, поэтому
// сохраняются вместе одним PATCH (`boardNotice` заменяется целиком), а не двумя
// кнопками, как у «Кто отвечает за данные». Механика та же, что у соседей
// (useSettingsTextField.ts, usePaymentReminderSection.ts): черновик и сверка с
// сохранённым по `settings.updatedAt` (useSavedDraft.ts), ошибка сервера через
// FormError. Пустой текст — явный сброс (`null`): объявления нет, срок без текста
// ничего не значит.
import { useState } from 'react';
import type { SettingsDto, UpdateSettingsInput } from '@xuanxue/shared';
import { errorFrom, type FormError } from '../components/FormServerError';
import { useSavedDraft } from './useSavedDraft';

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

export interface UseBoardNoticeFieldResult {
  form: FormState;
  setText: (text: string) => void;
  setUntil: (until: string) => void;
  hasChanges: boolean;
  pending: boolean;
  /** Ошибка формы (нет срока) или сервера — одним полем, показывается под кнопкой. */
  error: FormError | null;
  save: () => Promise<void>;
}

export function useBoardNoticeField(
  settings: SettingsDto | null,
  update: (input: UpdateSettingsInput) => Promise<void>,
): UseBoardNoticeFieldResult {
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

  async function save(): Promise<void> {
    if (pending || !hasChanges) return;
    if (trimmed !== '' && form.until === '') {
      setError({ message: UNTIL_REQUIRED_ERROR });
      return;
    }
    setPending(true);
    setError(null);
    const boardNotice = trimmed === '' ? null : { text: trimmed, until: form.until };
    try {
      await submit(form, () => update({ boardNotice }));
    } catch (err) {
      setError(errorFrom(err, SAVE_ERROR));
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
