// Поле «Кому писать, если человек ещё не в школе» (ADR-0115) — экран
// «Шаблоны» рядом с «Адрес сайта школы» (SchoolSiteField.tsx): тот же приём —
// своя кнопка «Сохранить», логика в хуке (useNewcomerContactField.ts,
// CLAUDE.md «Тесты»), компонент только рендерит. В отличие от адреса сайта
// поле нельзя очистить — «Сохранить» остаётся неактивной на пустом значении,
// как «Сохранить имя» на пустом обязательном имени (ProfileNameSection.tsx):
// свой вид ошибки на пустое поле здесь не заводится.
import type { CSSProperties } from 'react';
import {
  DEFAULT_NEWCOMER_CONTACT,
  SETTINGS_LIMITS,
  type SettingsDto,
  type UpdateSettingsInput,
} from '@xuanxue/shared';
import { Button } from '../components/Button';
import { Field, inputStyle } from '../components/Field';
import { FormServerError } from '../components/FormServerError';
import { primaryActionStyle, screenExplanationStyle } from '../components/screenLayout';
import { editorSectionStyle } from '../components/editorLayout';
import { useNewcomerContactField } from './useNewcomerContactField';

const EXPLANATION =
  'Бот даёт этот контакт тому, кто написал ему, а в школе ещё не занимается. ' +
  'Своим ученикам он вместо этого предлагает связать Telegram в кабинете.';

// Раздел отбит волосяной линией сверху, как «Школа» рядом (SchoolSiteField.tsx).
const sectionStyle: CSSProperties = {
  ...editorSectionStyle,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

interface NewcomerContactFieldProps {
  settings: SettingsDto | null;
  update: (input: UpdateSettingsInput) => Promise<void>;
}

export function NewcomerContactField({ settings, update }: NewcomerContactFieldProps) {
  const contact = useNewcomerContactField(settings, update);

  return (
    <section style={sectionStyle}>
      <h2 className="xuanxue-eyebrow" style={{ margin: 0 }}>
        Контакт для новичков
      </h2>

      <p style={screenExplanationStyle}>{EXPLANATION}</p>
      <Field label="Кому писать, если человек ещё не в школе">
        <input
          type="text"
          style={inputStyle}
          placeholder={DEFAULT_NEWCOMER_CONTACT}
          maxLength={SETTINGS_LIMITS.newcomerContactMaxLength}
          value={contact.value}
          onChange={(event) => contact.setValue(event.target.value)}
        />
      </Field>
      <FormServerError error={contact.error} />
      <Button
        variant="secondary"
        style={primaryActionStyle}
        onClick={() => void contact.save()}
        pending={contact.pending}
        disabled={!contact.hasChanges}
      >
        Сохранить контакт
      </Button>
    </section>
  );
}
