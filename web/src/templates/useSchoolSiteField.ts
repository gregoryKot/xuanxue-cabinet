// Логика поля «Адрес сайта школы» (В6 аудита, docs/adr/0009-domain-xuanxue-su.md
// дополнение) — вынесена из SchoolSiteField.tsx, чтобы проверять без React
// (CLAUDE.md «Тесты»). Сохранение идёт через ту же UseSettingsResult.update,
// что и шаблоны (useSettings.ts, TemplatesScreen.tsx) — отдельного PATCH тут
// нет (CLAUDE.md «Одна механика — один компонент»).
import { useEffect, useState } from 'react';
import type { SettingsDto, UpdateSettingsInput } from '@xuanxue/shared';
import { errorFrom, type FormError } from '../components/FormServerError';

const SAVE_ERROR = 'Не удалось сохранить адрес сайта школы. Попробуйте ещё раз.';

export interface UseSchoolSiteFieldResult {
  value: string;
  setValue: (value: string) => void;
  hasChanges: boolean;
  pending: boolean;
  error: FormError | null;
  save: () => Promise<void>;
}

export function useSchoolSiteField(
  settings: SettingsDto | null,
  update: (input: UpdateSettingsInput) => Promise<void>,
): UseSchoolSiteFieldResult {
  const [value, setValue] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<FormError | null>(null);

  // Синхронизация с сохранённым — по `updatedAt`, как texts в
  // TemplatesScreen.tsx: сработает на первой загрузке и заново после
  // успешного «Сохранить», но не перезатирает то, что учитель ещё печатает.
  useEffect(() => {
    setValue(settings?.schoolSiteUrl ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- нужен именно updatedAt, не весь объект settings
  }, [settings?.updatedAt]);

  const saved = settings?.schoolSiteUrl ?? '';
  const hasChanges = value.trim() !== saved;

  async function save(): Promise<void> {
    if (pending || !hasChanges) return;
    setPending(true);
    setError(null);
    try {
      // Пустое поле — явный сброс (null, NULLABLE_SETTINGS_FIELDS в
      // shared/src/settings.ts): «сайта нет», не «оставить как было».
      await update({ schoolSiteUrl: value.trim() || null });
    } catch (err) {
      setError(errorFrom(err, SAVE_ERROR));
    } finally {
      setPending(false);
    }
  }

  return { value, setValue, hasChanges, pending, error, save };
}
