// Раздел «Доска» экрана «Шаблоны»: объявление, которое каждый ученик видит на
// своей доске, и последний день показа (ADR-0172). Ретрит, перенос занятий,
// «оплата до 20 октября Маше» — одна строка, без учёта, кто что оплатил. Логика
// в хуке (useBoardNoticeField.ts), компонент только рендерит. Раздел под
// волосяной линией, кнопка вторичная: заливка терракотой на экране одна — у
// «Сохранить» под шаблонами постов (docs/adr/0031).
import type { CSSProperties } from 'react';
import {
  SETTINGS_LIMITS,
  type SettingsDto,
  type UpdateSettingsInput,
} from '@xuanxue/shared';
import { Button } from '../components/Button';
import { Field, inputStyle } from '../components/Field';
import { tzBadge } from '../schedule/timezoneLabel';
import { FormServerError } from '../components/FormServerError';
import { RichText } from '../components/RichText';
import { primaryActionStyle, screenExplanationStyle } from '../components/screenLayout';
import { editorSectionStyle } from '../components/editorLayout';
import { useBoardNoticeField } from './useBoardNoticeField';

const EXPLANATION =
  'Одна строка на **доске каждого ученика**: срок оплаты, ретрит, перенос занятий. ' +
  'Пока текст пустой, объявления нет.';
const TEXT_HINT =
  'Например: ретрит в ноябре — **оплата до 20 октября Маше**. Увидит каждый ученик на своей доске.';
const UNTIL_HINT = 'В **последний день** объявление ещё видно, на следующий исчезает.';

const sectionStyle: CSSProperties = {
  ...editorSectionStyle,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};
const dateInputStyle: CSSProperties = { ...inputStyle, width: 200 };

interface BoardNoticeFieldProps {
  settings: SettingsDto | null;
  update: (input: UpdateSettingsInput) => Promise<void>;
}

export function BoardNoticeField({ settings, update }: BoardNoticeFieldProps) {
  const notice = useBoardNoticeField(settings, update);
  const schoolTz = settings?.tz ? tzBadge(settings.tz) : null;
  const untilHint = schoolTz
    ? `${UNTIL_HINT} Дата по часам школы (**${schoolTz}**).`
    : UNTIL_HINT;

  return (
    <section style={sectionStyle}>
      <h2 className="xuanxue-eyebrow" style={{ margin: 0 }}>
        Доска
      </h2>

      <p style={screenExplanationStyle}>
        <RichText text={EXPLANATION} />
      </p>

      <Field label="Объявление ученикам" hint={TEXT_HINT}>
        <textarea
          style={{ ...inputStyle, minHeight: 88 }}
          maxLength={SETTINGS_LIMITS.boardNoticeTextMaxLength}
          value={notice.form.text}
          onChange={(event) => notice.setText(event.target.value)}
        />
      </Field>

      <Field label="Показывать до" hint={untilHint}>
        <input
          type="date"
          style={dateInputStyle}
          value={notice.form.until}
          onChange={(event) => notice.setUntil(event.target.value)}
        />
      </Field>

      <FormServerError error={notice.error} />
      <Button
        variant="secondary"
        style={primaryActionStyle}
        onClick={() => void notice.save()}
        pending={notice.pending}
        disabled={!notice.hasChanges}
      >
        Сохранить объявление
      </Button>
    </section>
  );
}
