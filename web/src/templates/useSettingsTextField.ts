// Общая логика текстового поля настроек школы, которое сохраняется своей
// кнопкой независимо от шаблонов (useSchoolSiteField.ts,
// useNewcomerContactField.ts) — CLAUDE.md «Одна механика — один компонент»:
// оба поля читают значение из SettingsDto, следят за изменениями, шлют
// PATCH через ту же UseSettingsResult.update (useSettings.ts) и показывают
// ошибку сервера одинаково, различается только то, какое поле читать/писать
// и валидно ли пустое значение. usePreviewMinutesField.ts сюда не переведён:
// там значение хранится строкой ради парсинга числа и своя валидация
// диапазона — не тот же случай (см. комментарий в файле).
import { useEffect, useState } from 'react';
import type { SettingsDto, UpdateSettingsInput } from '@xuanxue/shared';
import { errorFrom, type FormError } from '../components/FormServerError';

export interface UseSettingsTextFieldResult {
  value: string;
  setValue: (value: string) => void;
  hasChanges: boolean;
  pending: boolean;
  error: FormError | null;
  save: () => Promise<void>;
}

export interface UseSettingsTextFieldOptions {
  /** Достаёт сохранённое значение из настроек. Возвращать `undefined`
   * можно и нужно: поле бывает опциональным в SettingsDto (schoolSiteUrl),
   * а обязательное поле может не прийти от старого сервера, который его ещё
   * не отдаёт. Приводит к строке сам хук (readOr ниже) — одно место, а не
   * `?? ''` в каждом вызывающем. */
  read: (settings: SettingsDto) => string | undefined;
  /** Собирает тело PATCH из обрезанного значения поля. Решение «пустое —
   * это null (сброс) или пустая строка недопустима» — за вызывающим полем,
   * не за этим хуком. */
  write: (trimmed: string) => UpdateSettingsInput;
  /** Текст ошибки, когда сервер ответил не ApiError (сеть, таймаут). */
  saveError: string;
  /** Пустое значение допустимо (по умолчанию — да, как у адреса сайта:
   * пустое поле — явный сброс). Поле, которое нельзя очистить
   * (newcomerContact), передаёт `(trimmed) => trimmed !== ''`. */
  isValid?: (trimmed: string) => boolean;
}

export function useSettingsTextField(
  settings: SettingsDto | null,
  update: (input: UpdateSettingsInput) => Promise<void>,
  { read, write, saveError, isValid = () => true }: UseSettingsTextFieldOptions,
): UseSettingsTextFieldResult {
  const [value, setValue] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<FormError | null>(null);

  // Нет настроек или нет самого поля — пустая строка, не `undefined`.
  // Без этого приведения отсутствующее поле кладётся в состояние как есть, и
  // `value.trim()` ниже роняет TypeError'ом весь экран «Шаблоны», а не только
  // своё поле: ErrorBoundary съедает экран целиком (CI PR #391, падение
  // App.test.tsx на маршруте /templates — ответ сервера в моке не нёс
  // newcomerContact). Данных нет — показываем пусто (CLAUDE.md «Нет данных —
  // пусто, скелетон, „—“»), а не падаем.
  function readOr(from: SettingsDto | null): string {
    if (!from) return '';
    return read(from) ?? '';
  }

  // Синхронизация с сохранённым — по `updatedAt`, как texts в
  // TemplatesScreen.tsx: сработает на первой загрузке и заново после
  // успешного «Сохранить», но не перезатирает то, что учитель ещё печатает.
  useEffect(() => {
    setValue(readOr(settings));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- нужен именно updatedAt, не весь объект settings
  }, [settings?.updatedAt]);

  const saved = readOr(settings);
  const trimmed = value.trim();
  const hasChanges = trimmed !== saved && isValid(trimmed);

  async function save(): Promise<void> {
    if (pending || !hasChanges) return;
    setPending(true);
    setError(null);
    try {
      await update(write(trimmed));
    } catch (err) {
      setError(errorFrom(err, saveError));
    } finally {
      setPending(false);
    }
  }

  return { value, setValue, hasChanges, pending, error, save };
}
