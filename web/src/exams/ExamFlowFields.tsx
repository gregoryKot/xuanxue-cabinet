// «Как проходит экзамен» — два переключателя и три узких числовых поля,
// каждая пара в одну строку и переносится на 360px (flex-wrap, отзыв
// владельца 2026-09-27, ADR-0139). Перемешивание вопросов хранится у
// единственного блока, перемешивание вариантов — у самого экзамена
// (ADR-0033); учителю про это знать незачем, поэтому на экране они стоят
// рядом. Подстрочные объяснения ушли во всплывающие подсказки (InfoTip) —
// подряд идущие строки текста растягивали блок по вертикали больше, чем
// сами поля.
import type { CSSProperties } from 'react';
import { Field, inputStyle, numericInputStyle } from '../components/Field';
import { Toggle } from '../components/Toggle';
import { questionsPerAttemptHint } from './questionsPerAttempt';
import type { ExamFormState } from './examFormInput';

const SHUFFLE_QUESTIONS_LABEL = 'Перемешивать вопросы';
const SHUFFLE_QUESTIONS_TIP = 'У каждого ученика свой порядок.';
const SHUFFLE_OPTIONS_LABEL = 'Перемешивать варианты ответов';
const SHUFFLE_OPTIONS_TIP = 'Верный вариант не стоит на одном и том же месте.';
const TIME_LIMIT_TIP = 'Пусто — без ограничения.';
// ADR-0125: срок сдачи — не лимит времени попытки, а «до какого числа её
// вообще можно начать». Идущую попытку срок не прерывает, что бы с ним ни
// случилось дальше, — только новую. ADR-0139: только дата, час не нужен —
// срок действует до конца выбранного дня включительно.
const DUE_DATE_LABEL = 'Сдать до';
const DUE_DATE_TIP = 'Пусто — без срока. Включает весь выбранный день.';
const QUESTIONS_PER_ATTEMPT_LABEL = 'Вопросов ученику';

const columnStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12 };
// Переключатели при переносе на 360 px идут вплотную (у строки и так 44 px
// высоты под палец), между ними в ряд — 16 px.
const toggleRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0 16px',
};
// Дата — узким полем, как числа рядом: во всю ширину она читалась как поле для текста.
const dateInputStyle: CSSProperties = { ...inputStyle, width: 200 };
const numericRowStyle: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 16 };

interface ExamFlowFieldsProps {
  state: ExamFormState;
  setField: <K extends keyof ExamFormState>(key: K, value: ExamFormState[K]) => void;
}

export function ExamFlowFields({ state, setField }: ExamFlowFieldsProps) {
  return (
    <div style={columnStyle}>
      <div style={toggleRowStyle}>
        <Toggle
          label={SHUFFLE_QUESTIONS_LABEL}
          tip={SHUFFLE_QUESTIONS_TIP}
          checked={state.shuffleQuestions}
          onChange={(checked) => setField('shuffleQuestions', checked)}
        />
        <Toggle
          label={SHUFFLE_OPTIONS_LABEL}
          tip={SHUFFLE_OPTIONS_TIP}
          checked={state.shuffleOptions}
          onChange={(checked) => setField('shuffleOptions', checked)}
        />
      </div>

      <div style={numericRowStyle}>
        <Field label="Время, мин" tip={TIME_LIMIT_TIP}>
          <input
            style={numericInputStyle}
            inputMode="numeric"
            value={state.timeLimitMinText}
            onChange={(e) => setField('timeLimitMinText', e.target.value)}
          />
        </Field>

        <Field label="Попыток">
          <input
            style={numericInputStyle}
            inputMode="numeric"
            value={state.attemptsAllowedText}
            onChange={(e) => setField('attemptsAllowedText', e.target.value)}
          />
        </Field>

        <Field
          label={QUESTIONS_PER_ATTEMPT_LABEL}
          tip={questionsPerAttemptHint(state.questionIds.length)}
        >
          <input
            style={numericInputStyle}
            inputMode="numeric"
            value={state.questionsPerAttemptText}
            onChange={(e) => setField('questionsPerAttemptText', e.target.value)}
          />
        </Field>
      </div>

      {/* Дата без времени (ADR-0139) — в отличие от «Дата и время начала» у
          занятия (planning/LessonFormFields.tsx): срок сдачи действует до
          конца выбранного дня, час никто осмысленно не задавал. Второе,
          независимое от лимита времени ограничение (ADR-0125), поэтому не в
          строке числовых полей выше. */}
      <Field label={DUE_DATE_LABEL} tip={DUE_DATE_TIP}>
        <input
          type="date"
          style={dateInputStyle}
          value={state.dueDateText}
          onChange={(e) => setField('dueDateText', e.target.value)}
        />
      </Field>
    </div>
  );
}
