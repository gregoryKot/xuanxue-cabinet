// Секция «Школа» экрана «Шаблоны» (docs/PLAN.md §6) — данные и настройки
// школы, не тексты постов (те — TemplateEditor.tsx рядом). Два независимых
// поля со своими кнопками «Сохранить», их логика разнесена по хукам
// (useSchoolSiteField.ts, usePreviewMinutesField.ts), компонент только
// рендерит (CLAUDE.md «Тесты»):
// - адрес сайта школы (В6 аудита) — ссылку получают ученики и незнакомцы,
//   которые попали в кабинет (student/LessonsScreen.tsx) или написали боту
//   (start.handler.ts) — без неё они видят просто текст, не тупиковую
//   ссылку на сам кабинет, как раньше;
// - за сколько минут бот показывает учителю черновик поста перед отправкой
//   (ТЗ preview-minutes.md) — учитель успевает поправить тему или отменить
//   рассылку.
import type { CSSProperties } from 'react';
import {
  SETTINGS_LIMITS,
  type SettingsDto,
  type UpdateSettingsInput,
} from '@xuanxue/shared';
import { Button } from '../components/Button';
import { Field, inputStyle } from '../components/Field';
import { FormServerError } from '../components/FormServerError';
import { primaryActionStyle, screenExplanationStyle } from '../components/screenLayout';
import { editorSectionStyle } from '../components/editorLayout';
import { usePreviewMinutesField } from './usePreviewMinutesField';
import { useSchoolSiteField } from './useSchoolSiteField';

const SITE_EXPLANATION =
  'Ссылку получают ученики и незнакомцы, которые попали в кабинет или ' +
  'написали боту: без неё они видят просто текст.';

const PREVIEW_EXPLANATION =
  'Бот присылает черновик поста в Telegram заранее — успеваете поправить ' +
  'тему занятия или отменить рассылку до того, как она уйдёт в канал.';

// Раздел страницы — волосяная линия сверху, как у шаблонов рядом
// (TemplateEditor.tsx). Кнопки здесь вторичные: заливка терракотой на экране
// одна, у «Сохранить» под шаблонами (docs/adr/0031, отзыв владельца 2026-09-16).
const sectionStyle: CSSProperties = {
  ...editorSectionStyle,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

interface SchoolSiteFieldProps {
  settings: SettingsDto | null;
  update: (input: UpdateSettingsInput) => Promise<void>;
}

export function SchoolSiteField({ settings, update }: SchoolSiteFieldProps) {
  const site = useSchoolSiteField(settings, update);
  const preview = usePreviewMinutesField(settings, update);

  return (
    <section style={sectionStyle}>
      <h2 className="xuanxue-eyebrow" style={{ margin: 0 }}>
        Школа
      </h2>

      <p style={screenExplanationStyle}>{SITE_EXPLANATION}</p>
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
      {/* Отдельное имя кнопки, не «Сохранить» — на экране уже есть такая же
          у шаблонов ниже (TemplatesScreen.tsx), одинаковый текст дважды
          неразличим для скринридера и для getByRole в тестах. */}
      <Button
        variant="secondary"
        style={primaryActionStyle}
        onClick={() => void site.save()}
        pending={site.pending}
        disabled={!site.hasChanges}
      >
        Сохранить адрес
      </Button>

      <p style={screenExplanationStyle}>{PREVIEW_EXPLANATION}</p>
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
