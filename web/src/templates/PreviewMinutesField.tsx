// Раздел «Черновик поста» экрана «Шаблоны»: за сколько минут бот показывает
// учителю черновик перед отправкой (ТЗ preview-minutes.md) — успеть поправить
// тему или отменить рассылку. Это про посты, поэтому остаётся здесь; настройки
// школы — сайт, контакты, напоминания ученикам — переехали на экран «Школа»
// (school/SchoolScreen.tsx, ADR-0176). Логика — usePreviewMinutesField.ts.
import type { CSSProperties } from 'react';
import {
  SETTINGS_LIMITS,
  type SettingsDto,
  type UpdateSettingsInput,
} from '@xuanxue/shared';
import { Button } from '../components/Button';
import { Field, inputStyle } from '../components/Field';
import { FormServerError } from '../components/FormServerError';
import { RichText } from '../components/RichText';
import { primaryActionStyle, screenExplanationStyle } from '../components/screenLayout';
import { editorSectionStyle } from '../components/editorLayout';
import { usePreviewMinutesField } from './usePreviewMinutesField';

const PREVIEW_EXPLANATION =
  'Бот присылает черновик поста заранее — успеваете поправить или **отменить рассылку**.';

// Раздел под волосяной линией, кнопка вторичная: заливка терракотой на экране
// одна, у «Сохранить» под шаблонами (docs/adr/0031).
const sectionStyle: CSSProperties = {
  ...editorSectionStyle,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

interface PreviewMinutesFieldProps {
  settings: SettingsDto | null;
  update: (input: UpdateSettingsInput) => Promise<void>;
}

export function PreviewMinutesField({ settings, update }: PreviewMinutesFieldProps) {
  const preview = usePreviewMinutesField(settings, update);

  return (
    <section style={sectionStyle}>
      <h2 className="xuanxue-eyebrow" style={{ margin: 0 }}>
        Черновик поста
      </h2>
      <p style={screenExplanationStyle}>
        <RichText text={PREVIEW_EXPLANATION} />
      </p>
      <Field
        label="За сколько минут показывать черновик"
        hint={`Число от ${SETTINGS_LIMITS.previewMinutesMin} до ${SETTINGS_LIMITS.previewMinutesMax}`}
      >
        <input
          type="text"
          inputMode="numeric"
          style={inputStyle}
          value={preview.text}
          onChange={(event) => preview.setText(event.target.value)}
        />
      </Field>
      <FormServerError error={preview.error} />
      <Button
        variant="secondary"
        style={primaryActionStyle}
        onClick={() => void preview.save()}
        pending={preview.pending}
        disabled={!preview.hasChanges}
      >
        Сохранить время предпросмотра
      </Button>
    </section>
  );
}
