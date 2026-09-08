// «Адрес сайта школы» — секция экрана «Шаблоны» (docs/PLAN.md §6, В6 аудита:
// ссылку получают ученики и незнакомцы, которые попали в кабинет
// (StudentScreen.tsx) или написали боту (start.handler.ts) — без неё они
// видят просто текст, не тупиковую ссылку на сам кабинет, как раньше).
// Логика — useSchoolSiteField.ts (компонент только рендерит, CLAUDE.md
// «Тесты»).
import type { SettingsDto, UpdateSettingsInput } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { Field, inputStyle } from '../components/Field';
import { FormServerError } from '../components/FormServerError';
import { screenExplanationStyle } from '../components/screenLayout';
import { useSchoolSiteField } from './useSchoolSiteField';

const EXPLANATION =
  'Ссылку получают ученики и незнакомцы, которые попали в кабинет или ' +
  'написали боту: без неё они видят просто текст.';

interface SchoolSiteFieldProps {
  settings: SettingsDto | null;
  update: (input: UpdateSettingsInput) => Promise<void>;
}

export function SchoolSiteField({ settings, update }: SchoolSiteFieldProps) {
  const field = useSchoolSiteField(settings, update);

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h2 style={{ margin: 0, fontSize: 16 }}>Школа</h2>
      <p style={screenExplanationStyle}>{EXPLANATION}</p>
      <Field label="Адрес сайта школы">
        <input
          type="url"
          style={inputStyle}
          placeholder="https://…"
          value={field.value}
          onChange={(event) => field.setValue(event.target.value)}
        />
      </Field>
      <FormServerError error={field.error} />
      {/* Отдельное имя кнопки, не «Сохранить» — на экране уже есть такая же
          у шаблонов ниже (TemplatesScreen.tsx), одинаковый текст дважды
          неразличим для скринридера и для getByRole в тестах. */}
      <Button
        onClick={() => void field.save()}
        pending={field.pending}
        disabled={!field.hasChanges}
      >
        Сохранить адрес
      </Button>
    </section>
  );
}
