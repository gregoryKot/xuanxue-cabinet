// Поле «Напоминать об оплате» в секции «Оплата» профиля (ADR-0161): ученик сам
// выбирает день месяца (не выбрал — напоминания нет), час общий и задан
// школой. Логика сохранения — usePaymentReminderDay.ts, варианты — paymentReminderDayOptions.ts; здесь
// только рендер. Кегль select держит правило index.css (ADR-0109).
import type { CSSProperties } from 'react';
import type { MyPaymentReminderDto } from '@xuanxue/shared';
import { Field } from '../components/Field';
import { Select } from '../components/Select';
import { DAY_OPTIONS, reminderHint, selectedDayValue } from './paymentReminderDayOptions';
import { usePaymentReminderDay } from './usePaymentReminderDay';

const LABEL = 'Напоминать об оплате';

// Узкий select: число дня — короткая строка, во всю ширину колонки он
// читался бы как поле для текста.
const selectWidthStyle: CSSProperties = { maxWidth: 260 };

interface PaymentReminderDayFieldProps {
  reminder: MyPaymentReminderDto;
  onSaved: (reminder: MyPaymentReminderDto) => void;
}

export function PaymentReminderDayField({
  reminder,
  onSaved,
}: PaymentReminderDayFieldProps) {
  const { pending, error, choose } = usePaymentReminderDay(onSaved);

  return (
    <Field label={LABEL} hint={reminderHint(reminder)} error={error ?? undefined}>
      <Select
        style={selectWidthStyle}
        value={selectedDayValue(reminder)}
        disabled={pending}
        onChange={(event) => void choose(event.target.value)}
      >
        {DAY_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}
