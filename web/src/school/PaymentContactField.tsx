// Поле «Кому и куда присылать скриншот об оплате» (ADR-0159) — экран «Шаблоны», сразу
// под напоминанием об оплате (PaymentReminderSection.tsx): контакт видят
// ученики в «Профиле» и в самом напоминании (подстановка `{контакт}`). Способ
// связи («в Telegram», WhatsApp, телефон) пишется в самом контакте, из кода он
// убран: поэтому пояснение учит писать контакт в дательном падеже и с местом. Тот же
// приём, что NewcomerContactField.tsx: своя кнопка «Сохранить»
// (SettingsTextField.tsx), логика в хуке (usePaymentContactField.ts),
// компонент только рендерит. Поле нельзя очистить — «Сохранить» неактивна на
// пустом значении.
import {
  DEFAULT_PAYMENT_CONTACT,
  SETTINGS_LIMITS,
  type SettingsDto,
  type UpdateSettingsInput,
} from '@xuanxue/shared';
import { RichText } from '../components/RichText';
import { screenExplanationStyle } from '../components/screenLayout';
import { SettingsTextField } from '../templates/SettingsTextField';
import { usePaymentContactField } from './usePaymentContactField';
import { schoolSectionStyle } from './schoolSectionStyle';

const EXPLANATION =
  'Этот текст видят **ученики**: в «Профиле» и в напоминании об оплате. ' +
  'Он встаёт после слов «Отправьте скриншот об оплате…», поэтому пишите в дательном падеже и с местом. ' +
  'Способов можно указать несколько: «Маше Вязовой — в Telegram @marievyazova или в WhatsApp».';

interface PaymentContactFieldProps {
  settings: SettingsDto | null;
  update: (input: UpdateSettingsInput) => Promise<void>;
}

export function PaymentContactField({ settings, update }: PaymentContactFieldProps) {
  const contact = usePaymentContactField(settings, update);

  return (
    <section style={schoolSectionStyle}>
      <h2 className="xuanxue-eyebrow" style={{ margin: 0 }}>
        Контакт для оплаты
      </h2>

      <p style={screenExplanationStyle}>
        <RichText text={EXPLANATION} />
      </p>
      <SettingsTextField
        label="Кому и куда присылать скриншот об оплате"
        saveLabel="Сохранить контакт для оплаты"
        placeholder={DEFAULT_PAYMENT_CONTACT}
        maxLength={SETTINGS_LIMITS.paymentContactMaxLength}
        field={contact}
      />
    </section>
  );
}
