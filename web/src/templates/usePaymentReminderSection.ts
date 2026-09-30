// Логика секции «Оплаты» экрана «Шаблоны» (docs/PLAN.md §15 п. 2.5, ADR-0051,
// ADR-0150): включатель, время и текст напоминания ученику об
// оплате. Компонент (PaymentReminderSection.tsx) только рендерит, всё
// остальное — здесь (CLAUDE.md «Логика вне компонентов»).
//
// Механика та же, что у полей рядом (useMinutesField.ts, useSettingsTextField.ts):
// черновик и его сверка с сохранённым по `settings.updatedAt` (useSavedDraft.ts),
// PATCH только с изменёнными полями, ошибка сервера через FormError. Дня у
// школы нет: его выбирает каждый ученик в «Профиле» (ADR-0161).
import { useState } from 'react';
import {
  DEFAULT_PAYMENT_REMINDER,
  PAYMENT_REMINDER_PLACEHOLDERS,
  RULE_TIME_RE,
  type PaymentReminderSettings,
  type SettingsDto,
  type UpdateSettingsInput,
} from '@xuanxue/shared';
import { errorFrom, type FormError } from '../components/FormServerError';
import { useInsertAtCursor } from './useInsertAtCursor';
import { useSavedDraft } from './useSavedDraft';
import { validateTemplateText } from './templateValidation';

const SAVE_ERROR = 'Не удалось сохранить напоминание. Попробуйте ещё раз.';
const TIME_ERROR = 'Время — часы и минуты, например 10:00.';

// `type`, не `interface`: useSavedDraft.ts принимает плоскую запись, а у
// интерфейса нет неявной индексной сигнатуры.
type FormState = {
  enabled: boolean;
  time: string;
  template: string;
};

// Старая база без подобъекта отдаёт его поле за полем (settings.ts, PLAN §4):
// ответ сервера и мок теста без `paymentReminder` не должны ронять экран.
function savedReminder(settings: SettingsDto | null): PaymentReminderSettings {
  const stored: Partial<PaymentReminderSettings> | undefined = settings?.paymentReminder;
  return { ...DEFAULT_PAYMENT_REMINDER, ...stored };
}

function toForm(saved: PaymentReminderSettings): FormState {
  return {
    enabled: saved.enabled,
    time: saved.time,
    template: saved.template,
  };
}

function changedFields(
  form: FormState,
  saved: PaymentReminderSettings,
): Partial<PaymentReminderSettings> {
  const changed: Partial<PaymentReminderSettings> = {};
  if (form.enabled !== saved.enabled) changed.enabled = form.enabled;
  if (form.time !== saved.time) changed.time = form.time;
  if (form.template !== saved.template) changed.template = form.template;
  return changed;
}

export function usePaymentReminderSection(
  settings: SettingsDto | null,
  update: (input: UpdateSettingsInput) => Promise<void>,
) {
  const saved = savedReminder(settings);
  // Сверка с сохранённым по `updatedAt` — на первой загрузке и после
  // сохранения (ответ PATCH несёт свежий updatedAt); набранное и ещё не
  // сохранённое поле она не трогает (useSavedDraft.ts).
  const [form, setForm, submit] = useSavedDraft(toForm(saved), settings?.updatedAt);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<FormError | null>(null);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const { textareaRef, insertAtCursor } = useInsertAtCursor(form.template, (template) =>
    setField('template', template),
  );

  const timeError = RULE_TIME_RE.test(form.time) ? null : TIME_ERROR;
  const templateError = validateTemplateText(
    form.template,
    PAYMENT_REMINDER_PLACEHOLDERS,
  );
  const isValid = !timeError && !templateError;
  const changed = isValid ? changedFields(form, saved) : {};
  const hasChanges = Object.keys(changed).length > 0;

  async function save(): Promise<void> {
    if (pending || !hasChanges) return;
    setPending(true);
    setError(null);
    try {
      await submit(form, () => update({ paymentReminder: changed }));
    } catch (err) {
      setError(errorFrom(err, SAVE_ERROR));
    } finally {
      setPending(false);
    }
  }

  return {
    form,
    setField,
    timeError,
    templateError,
    hasChanges,
    pending,
    error,
    save,
    textareaRef,
    insertAtCursor,
    resetTemplate: () => setField('template', DEFAULT_PAYMENT_REMINDER.template),
  };
}
