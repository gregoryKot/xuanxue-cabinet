// Поле «Кому присылать скриншот перевода» (ADR-0159) — экран «Шаблоны», сразу
// под напоминанием об оплате (PaymentReminderSection.tsx): контакт видят
// ученики в «Профиле» и в самом напоминании (подстановка `{контакт}`). Тот же
// приём, что NewcomerContactField.tsx: своя кнопка «Сохранить»
// (SettingsTextField.tsx), логика в хуке (usePaymentContactField.ts),
// компонент только рендерит. Поле нельзя очистить — «Сохранить» неактивна на
// пустом значении.
import type { CSSProperties } from 'react';
import {
  DEFAULT_PAYMENT_CONTACT,
  SETTINGS_LIMITS,
  type SettingsDto,
  type UpdateSettingsInput,
} from '@xuanxue/shared';
import { RichText } from '../components/RichText';
import { screenExplanationStyle } from '../components/screenLayout';
import { editorSectionStyle } from '../components/editorLayout';
import { SettingsTextField } from './SettingsTextField';
import { usePaymentContactField } from './usePaymentContactField';

const EXPLANATION =
  'Этот контакт видят **ученики**: в «Профиле» и в напоминании об оплате — туда они пришлют скриншот перевода.';

const sectionStyle: CSSProperties = {
  ...editorSectionStyle,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

interface PaymentContactFieldProps {
  settings: SettingsDto | null;
  update: (input: UpdateSettingsInput) => Promise<void>;
}

export function PaymentContactField({ settings, update }: PaymentContactFieldProps) {
  const contact = usePaymentContactField(settings, update);

  return (
    <section style={sectionStyle}>
      <h2 className="xuanxue-eyebrow" style={{ margin: 0 }}>
        Контакт для оплаты
      </h2>

      <p style={screenExplanationStyle}>
        <RichText text={EXPLANATION} />
      </p>
      <SettingsTextField
        label="Кому присылать скриншот перевода"
        saveLabel="Сохранить контакт для оплаты"
        placeholder={DEFAULT_PAYMENT_CONTACT}
        maxLength={SETTINGS_LIMITS.paymentContactMaxLength}
        field={contact}
      />
    </section>
  );
}
