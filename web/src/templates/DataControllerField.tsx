// Раздел «Кто отвечает за данные» экрана «Шаблоны»: имя и способ связи,
// которые страница `/privacy` называет ученикам (статья 11 Закона о защите
// частной жизни Израиля — просить данные можно, только назвав, кто ими
// владеет). Тот же приём, что NewcomerContactField.tsx: у каждого поля своя
// кнопка «Сохранить» (SettingsTextField.tsx), логика в хуке
// (useDataControllerFields.ts), компонент только рендерит. В отличие от
// контакта для новичков поля можно очистить — страница тогда отправляет к
// учителю, а не выдумывает имя.
import type { CSSProperties } from 'react';
import {
  SETTINGS_LIMITS,
  type SettingsDto,
  type UpdateSettingsInput,
} from '@xuanxue/shared';
import { RichText } from '../components/RichText';
import { screenExplanationStyle } from '../components/screenLayout';
import { editorSectionStyle } from '../components/editorLayout';
import { SettingsTextField } from './SettingsTextField';
import { useDataControllerFields } from './useDataControllerFields';

const EXPLANATION =
  'Закон требует назвать на странице политики конфиденциальности, ' +
  '**кто отвечает за данные учеников** и как с ним связаться.';
const NAME_HINT = 'Пока поле пустое, страница отправляет учеников к учителю.';

// Раздел отбит волосяной линией сверху, как «Контакт для новичков» рядом.
const sectionStyle: CSSProperties = {
  ...editorSectionStyle,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

interface DataControllerFieldProps {
  settings: SettingsDto | null;
  update: (input: UpdateSettingsInput) => Promise<void>;
}

export function DataControllerField({ settings, update }: DataControllerFieldProps) {
  const { name, contact } = useDataControllerFields(settings, update);

  return (
    <section style={sectionStyle}>
      <h2 className="xuanxue-eyebrow" style={{ margin: 0 }}>
        Кто отвечает за данные
      </h2>

      <p style={screenExplanationStyle}>
        <RichText text={EXPLANATION} />
      </p>
      <SettingsTextField
        label="Имя человека или название школы"
        hint={NAME_HINT}
        saveLabel="Сохранить ответственного"
        maxLength={SETTINGS_LIMITS.dataControllerNameMaxLength}
        field={name}
      />
      <SettingsTextField
        label="Как связаться: почта, телефон или Telegram"
        saveLabel="Сохранить способ связи"
        maxLength={SETTINGS_LIMITS.dataControllerContactMaxLength}
        field={contact}
      />
    </section>
  );
}
