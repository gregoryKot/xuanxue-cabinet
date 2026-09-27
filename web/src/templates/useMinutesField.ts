// Общая логика числового поля минут настроек школы, которое сохраняется
// своей кнопкой независимо от шаблонов (usePreviewMinutesField.ts,
// useLessonReminderMinutesField.ts) — тот же приём, что useSettingsTextField.ts
// у текстовых полей (CLAUDE.md «Одна механика — один компонент»): жскпд не
// пропустил бы вторую копию одной и той же логики диапазона и парсинга.
// Значение хранится в форме строкой, не числом — иначе пустое поле мгновенно
// становится 0 при Number(''), и учитель не может стереть цифру, чтобы
// напечатать новую (тот же приём, что у leadMinutesText в classFormInput.ts).
import { useEffect, useState } from 'react';
import type { SettingsDto, UpdateSettingsInput } from '@xuanxue/shared';
import { errorFrom, type FormError } from '../components/FormServerError';

export interface UseMinutesFieldResult {
  text: string;
  setText: (value: string) => void;
  isValid: boolean;
  hasChanges: boolean;
  pending: boolean;
  error: FormError | null;
  save: () => Promise<void>;
}

export interface UseMinutesFieldOptions {
  /** Достаёт сохранённое число минут из настроек. */
  read: (settings: SettingsDto) => number;
  /** Собирает тело PATCH из введённого числа. */
  write: (value: number) => UpdateSettingsInput;
  /** Значение поля, пока настройки школы ещё не загружены. */
  defaultValue: number;
  min: number;
  max: number;
  /** Текст ошибки, когда сервер ответил не ApiError (сеть, таймаут). */
  saveError: string;
}

function isValidMinutes(text: string, min: number, max: number): boolean {
  const value = Number(text);
  return text.trim() !== '' && Number.isInteger(value) && value >= min && value <= max;
}

export function useMinutesField(
  settings: SettingsDto | null,
  update: (input: UpdateSettingsInput) => Promise<void>,
  { read, write, defaultValue, min, max, saveError }: UseMinutesFieldOptions,
): UseMinutesFieldResult {
  const [text, setText] = useState(String(defaultValue));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<FormError | null>(null);

  // Синхронизация с сохранённым — по `updatedAt`, как texts в
  // TemplatesScreen.tsx: сработает на первой загрузке и заново после
  // успешного «Сохранить», но не перезатирает то, что учитель ещё печатает
  // между сохранениями.
  useEffect(() => {
    setText(String(settings ? read(settings) : defaultValue));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- нужен именно updatedAt, не весь объект settings
  }, [settings?.updatedAt]);

  const saved = settings ? read(settings) : defaultValue;
  const isValid = isValidMinutes(text, min, max);
  const hasChanges = isValid && Number(text) !== saved;

  async function save(): Promise<void> {
    if (pending || !hasChanges) return;
    setPending(true);
    setError(null);
    try {
      await update(write(Number(text)));
    } catch (err) {
      setError(errorFrom(err, saveError));
    } finally {
      setPending(false);
    }
  }

  return { text, setText, isValid, hasChanges, pending, error, save };
}
