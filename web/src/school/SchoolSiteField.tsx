// Адрес сайта школы (В6 аудита) — ссылку получают ученики и незнакомцы,
// которые попали в кабинет (student/LessonsScreen.tsx) или написали боту
// (start.handler.ts). Раздел экрана «Школа» (ADR-0176); логика —
// useSchoolSiteField.ts, компонент только рендерит.
import type { SettingsDto, UpdateSettingsInput } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { Field, inputStyle } from '../components/Field';
import { FormServerError } from '../components/FormServerError';
import { RichText } from '../components/RichText';
import { primaryActionStyle, screenExplanationStyle } from '../components/screenLayout';
import { schoolSectionStyle } from './schoolSectionStyle';
import { useSchoolSiteField } from './useSchoolSiteField';

const SITE_EXPLANATION =
  'Эту ссылку видят **ученики и незнакомцы**, которые попали в кабинет или написали боту.';

interface SchoolSiteFieldProps {
  settings: SettingsDto | null;
  update: (input: UpdateSettingsInput) => Promise<void>;
}

export function SchoolSiteField({ settings, update }: SchoolSiteFieldProps) {
  const site = useSchoolSiteField(settings, update);

  return (
    <section style={schoolSectionStyle}>
      <h2 className="xuanxue-eyebrow" style={{ margin: 0 }}>
        Сайт школы
      </h2>
      <p style={screenExplanationStyle}>
        <RichText text={SITE_EXPLANATION} />
      </p>
      <Field label="Адрес сайта школы">
        <input
          type="url"
          style={inputStyle}
          placeholder="https://…"
          value={site.value}
          onChange={(event) => site.setValue(event.target.value)}
        />
      </Field>
      <FormServerError error={site.error} />
      <Button
        variant="secondary"
        style={primaryActionStyle}
        onClick={() => void site.save()}
        pending={site.pending}
        disabled={!site.hasChanges}
      >
        Сохранить адрес
      </Button>
    </section>
  );
}
