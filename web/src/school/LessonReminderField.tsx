// За сколько минут ученику приходит напоминание о занятии — лента кабинета и
// push (ADR-0135); под полем — сколько учеников выбрали своё время (ADR-0162).
// Раздел экрана «Школа» (ADR-0176): это обещание ученикам, а не текст поста,
// поэтому с «Шаблонов» оно ушло сюда. Логика — useLessonReminderMinutesField.ts.
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
import { LessonPrefsStats } from './LessonPrefsStats';
import { schoolSectionStyle } from './schoolSectionStyle';
import { useLessonReminderMinutesField } from './useLessonReminderMinutesField';

const REMINDER_EXPLANATION =
  'Ученик получает напоминание о занятии в кабинет и **push-уведомлением на телефон**.';

interface LessonReminderFieldProps {
  settings: SettingsDto | null;
  update: (input: UpdateSettingsInput) => Promise<void>;
}

export function LessonReminderField({ settings, update }: LessonReminderFieldProps) {
  const reminder = useLessonReminderMinutesField(settings, update);

  return (
    <section style={schoolSectionStyle}>
      <h2 className="xuanxue-eyebrow" style={{ margin: 0 }}>
        Напоминание о занятии
      </h2>
      <p style={screenExplanationStyle}>
        <RichText text={REMINDER_EXPLANATION} />
      </p>
      <Field
        label="За сколько минут напомнить ученикам о занятии"
        hint={`Число от ${SETTINGS_LIMITS.lessonReminderMinutesMin} до ${SETTINGS_LIMITS.lessonReminderMinutesMax}`}
      >
        <input
          type="text"
          inputMode="numeric"
          style={inputStyle}
          value={reminder.text}
          onChange={(event) => reminder.setText(event.target.value)}
        />
      </Field>
      <FormServerError error={reminder.error} />
      <Button
        variant="secondary"
        style={primaryActionStyle}
        onClick={() => void reminder.save()}
        pending={reminder.pending}
        disabled={!reminder.hasChanges}
      >
        Сохранить напоминание о занятии
      </Button>
      <LessonPrefsStats />
    </section>
  );
}
