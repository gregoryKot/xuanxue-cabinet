// Поле «Кому писать, если человек ещё не в школе» (ADR-0115) — экран
// «Шаблоны» рядом с «Адрес сайта школы» (SchoolSiteField.tsx): тот же приём —
// своя кнопка «Сохранить» (SettingsTextField.tsx), логика в хуке
// (useNewcomerContactField.ts, CLAUDE.md «Тесты»), компонент только
// рендерит. В отличие от адреса сайта поле нельзя очистить — «Сохранить»
// остаётся неактивной на пустом значении, как «Сохранить имя» на пустом
// обязательном имени (ProfileNameSection.tsx): свой вид ошибки на пустое поле
// здесь не заводится.
import {
  DEFAULT_NEWCOMER_CONTACT,
  SETTINGS_LIMITS,
  type SettingsDto,
  type UpdateSettingsInput,
} from '@xuanxue/shared';
import { screenExplanationStyle } from '../components/screenLayout';
import { SettingsTextField } from '../templates/SettingsTextField';
import { useNewcomerContactField } from './useNewcomerContactField';
import { schoolSectionStyle } from './schoolSectionStyle';

const EXPLANATION =
  'Бот даёт этот контакт тому, кто написал ему, а в школе ещё не занимается.';

interface NewcomerContactFieldProps {
  settings: SettingsDto | null;
  update: (input: UpdateSettingsInput) => Promise<void>;
}

export function NewcomerContactField({ settings, update }: NewcomerContactFieldProps) {
  const contact = useNewcomerContactField(settings, update);

  return (
    <section style={schoolSectionStyle}>
      <h2 className="xuanxue-eyebrow" style={{ margin: 0 }}>
        Контакт для новичков
      </h2>

      <p style={screenExplanationStyle}>{EXPLANATION}</p>
      <SettingsTextField
        label="Кому писать, если человек ещё не в школе"
        saveLabel="Сохранить контакт"
        placeholder={DEFAULT_NEWCOMER_CONTACT}
        maxLength={SETTINGS_LIMITS.newcomerContactMaxLength}
        field={contact}
      />
    </section>
  );
}
