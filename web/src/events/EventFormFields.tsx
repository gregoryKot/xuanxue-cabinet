// Поля страницы события школы (ADR-0177). Подсказки говорят, что писать:
// ученик увидит эти строки на своей доске, и «зачем поле» должно быть ясно
// до того, как человек начал печатать.
import { SCHOOL_EVENT_LIMITS } from '@xuanxue/shared';
import { Field, inputStyle } from '../components/Field';
import type { EventFormError, EventFormState } from './eventFormInput';

const END_HINT = 'Для ретрита на несколько дней';
const PLACE_HINT = 'Например «Кибуц Амиад» или «онлайн»';
const DESCRIPTION_HINT =
  'Что взять и сколько стоит: «**1200 ₪** до 20 октября, оплата переводом»';
const DESCRIPTION_MIN_HEIGHT_PX = 120;

function errorFor(
  error: EventFormError | null,
  field: EventFormError['field'],
): string | undefined {
  return error?.field === field ? error.message : undefined;
}

interface EventFormFieldsProps {
  state: EventFormState;
  setField: <K extends keyof EventFormState>(key: K, value: EventFormState[K]) => void;
  error: EventFormError | null;
}

export function EventFormFields({ state, setField, error }: EventFormFieldsProps) {
  return (
    <>
      <Field label="Название" error={errorFor(error, 'title')}>
        <input
          style={inputStyle}
          maxLength={SCHOOL_EVENT_LIMITS.title}
          value={state.title}
          onChange={(e) => setField('title', e.target.value)}
        />
      </Field>

      <Field label="Начало" error={errorFor(error, 'startsAt')}>
        <input
          type="datetime-local"
          style={inputStyle}
          value={state.startsAtLocal}
          onChange={(e) => setField('startsAtLocal', e.target.value)}
        />
      </Field>

      <Field label="Конец" hint={END_HINT} error={errorFor(error, 'endsAt')}>
        <input
          type="datetime-local"
          style={inputStyle}
          value={state.endsAtLocal}
          onChange={(e) => setField('endsAtLocal', e.target.value)}
        />
      </Field>

      <Field label="Место" hint={PLACE_HINT}>
        <input
          style={inputStyle}
          maxLength={SCHOOL_EVENT_LIMITS.place}
          value={state.place}
          onChange={(e) => setField('place', e.target.value)}
        />
      </Field>

      <Field label="Подробности" hint={DESCRIPTION_HINT}>
        <textarea
          style={{ ...inputStyle, minHeight: DESCRIPTION_MIN_HEIGHT_PX }}
          maxLength={SCHOOL_EVENT_LIMITS.description}
          value={state.description}
          onChange={(e) => setField('description', e.target.value)}
        />
      </Field>
    </>
  );
}
