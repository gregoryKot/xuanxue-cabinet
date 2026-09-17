// Логика поля «За сколько минут показывать черновик» (docs/PLAN.md §6,
// ТЗ preview-minutes.md) — вынесена из PreviewMinutesField.tsx, чтобы
// проверять без React (CLAUDE.md «Тесты»). Сохранение — через ту же
// UseSettingsResult.update, что и шаблоны/адрес сайта (useSettings.ts).
// Значение хранится в форме строкой, не числом — иначе пустое поле мгновенно
// становится 0 при Number(''), и учитель не может стереть цифру, чтобы
// напечатать новую (тот же приём, что у leadMinutesText в classFormInput.ts).
import { useEffect, useState } from 'react';
import {
  DEFAULT_PREVIEW_MINUTES,
  SETTINGS_LIMITS,
  type SettingsDto,
  type UpdateSettingsInput,
} from '@xuanxue/shared';
import { errorFrom, type FormError } from '../components/FormServerError';

const SAVE_ERROR = 'Не удалось сохранить время предпросмотра. Попробуйте ещё раз.';

export interface UsePreviewMinutesFieldResult {
  text: string;
  setText: (value: string) => void;
  isValid: boolean;
  hasChanges: boolean;
  pending: boolean;
  error: FormError | null;
  save: () => Promise<void>;
}

function isValidPreviewMinutes(text: string): boolean {
  const value = Number(text);
  return (
    text.trim() !== '' &&
    Number.isInteger(value) &&
    value >= SETTINGS_LIMITS.previewMinutesMin &&
    value <= SETTINGS_LIMITS.previewMinutesMax
  );
}

export function usePreviewMinutesField(
  settings: SettingsDto | null,
  update: (input: UpdateSettingsInput) => Promise<void>,
): UsePreviewMinutesFieldResult {
  const [text, setText] = useState(String(DEFAULT_PREVIEW_MINUTES));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<FormError | null>(null);

  // Синхронизация с сохранённым — по `updatedAt`, как texts в
  // TemplatesScreen.tsx/useSchoolSiteField.ts: сработает на первой загрузке
  // и заново после успешного «Сохранить», но не перезатирает то, что
  // учитель ещё печатает между сохранениями.
  useEffect(() => {
    setText(String(settings?.previewMinutes ?? DEFAULT_PREVIEW_MINUTES));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- нужен именно updatedAt, не весь объект settings
  }, [settings?.updatedAt]);

  const saved = settings?.previewMinutes ?? DEFAULT_PREVIEW_MINUTES;
  const isValid = isValidPreviewMinutes(text);
  const hasChanges = isValid && Number(text) !== saved;

  async function save(): Promise<void> {
    if (pending || !hasChanges) return;
    setPending(true);
    setError(null);
    try {
      await update({ previewMinutes: Number(text) });
    } catch (err) {
      setError(errorFrom(err, SAVE_ERROR));
    } finally {
      setPending(false);
    }
  }

  return { text, setText, isValid, hasChanges, pending, error, save };
}
