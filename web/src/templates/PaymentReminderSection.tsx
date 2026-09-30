// Секция «Оплаты» экрана «Шаблоны» (docs/PLAN.md §15 п. 2.5, ADR-0051,
// ADR-0150) — ежемесячная напоминалка ученику об оплате (ADR-0157). Дня у школы
// нет: свой день ученик выбирает в «Профиле», не выбравшему напоминание не
// приходит (ADR-0161). Логика в usePaymentReminderSection.ts, компонент только рендерит (CLAUDE.md «Тесты»).
// Раздел под волосяной линией, как «Школа» (SchoolSiteField.tsx); кнопка
// вторичная: заливка терракотой на экране одна, у «Сохранить» под шаблонами
// постов (docs/adr/0031). Название кнопки своё — «Сохранить» на экране уже есть.
import type { CSSProperties } from 'react';
import {
  PAYMENT_REMINDER_PLACEHOLDERS,
  type SettingsDto,
  type UpdateSettingsInput,
} from '@xuanxue/shared';
import { Button } from '../components/Button';
import { Field, inputStyle } from '../components/Field';
import { FormServerError } from '../components/FormServerError';
import { RichText } from '../components/RichText';
import { primaryActionStyle, screenExplanationStyle } from '../components/screenLayout';
import { editorSectionStyle } from '../components/editorLayout';
import { TextLinkButton } from '../components/TextLinkButton';
import { Toggle } from '../components/Toggle';
import { tzBadge } from '../schedule/timezoneLabel';
import { PlaceholderChips } from './PlaceholderChips';
import { PAYMENT_REMINDER_HINTS } from './placeholderHints';
import { usePaymentReminderSection } from './usePaymentReminderSection';

const EXPLANATION =
  'В час ниже бот напомнит ученикам **об оплате за месяц**. ' +
  'День каждый ученик выбирает сам в «Профиле»: **кому день не выбран, тому напоминание не приходит**. ' +
  'Нет чата с ботом — напоминание придёт в кабинет.';

const HINT_OFF = 'Сейчас выключено — ученикам ничего не приходит.';
const HINT_ON = 'Включено — тем, кто выбрал день, напоминание придёт в час ниже.';

const sectionStyle: CSSProperties = {
  ...editorSectionStyle,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};
const rowStyle: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 16 };
const timeInputStyle: CSSProperties = { ...inputStyle, width: 140 };

interface PaymentReminderSectionProps {
  settings: SettingsDto | null;
  update: (input: UpdateSettingsInput) => Promise<void>;
}

export function PaymentReminderSection({
  settings,
  update,
}: PaymentReminderSectionProps) {
  const reminder = usePaymentReminderSection(settings, update);
  const { form, setField } = reminder;
  const schoolTz = settings?.tz ? tzBadge(settings.tz) : null;

  return (
    <section style={sectionStyle}>
      <h2 className="xuanxue-eyebrow" style={{ margin: 0 }}>
        Оплаты
      </h2>

      <p style={screenExplanationStyle}>
        <RichText text={EXPLANATION} />
      </p>

      <Toggle
        label="Напоминать об оплате"
        hint={form.enabled ? HINT_ON : HINT_OFF}
        checked={form.enabled}
        disabled={reminder.pending}
        onChange={(checked) => setField('enabled', checked)}
      />

      <div style={rowStyle}>
        <Field
          label="Время"
          hint={schoolTz ? `По часам школы (**${schoolTz}**)` : undefined}
          error={reminder.timeError ?? undefined}
        >
          <input
            type="time"
            style={timeInputStyle}
            value={form.time}
            onChange={(event) => setField('time', event.target.value)}
          />
        </Field>
      </div>

      <Field label="Текст напоминания" error={reminder.templateError ?? undefined}>
        <textarea
          ref={reminder.textareaRef}
          style={{ ...inputStyle, minHeight: 120 }}
          value={form.template}
          onChange={(event) => setField('template', event.target.value)}
        />
      </Field>
      <PlaceholderChips
        names={PAYMENT_REMINDER_PLACEHOLDERS}
        hints={PAYMENT_REMINDER_HINTS}
        summary="Что подставится в напоминание"
        onInsert={reminder.insertAtCursor}
      />
      <TextLinkButton onClick={reminder.resetTemplate}>
        Сбросить напоминание к тексту по умолчанию
      </TextLinkButton>

      <FormServerError error={reminder.error} />
      <Button
        variant="secondary"
        style={primaryActionStyle}
        onClick={() => void reminder.save()}
        pending={reminder.pending}
        disabled={!reminder.hasChanges}
      >
        Сохранить напоминание
      </Button>
    </section>
  );
}
