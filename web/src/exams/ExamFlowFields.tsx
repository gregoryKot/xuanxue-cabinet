// «Как проходит экзамен» — два переключателя с объяснением и две цифры
// (макет Form.dc.html). Перемешивание вопросов хранится у единственного
// блока, перемешивание вариантов — у самого экзамена (ADR-0033); учителю про
// это знать незачем, поэтому на экране они стоят рядом.
import type { CSSProperties } from 'react';
import { Field, inputStyle, numericInputStyle } from '../components/Field';
import { Toggle } from '../components/Toggle';
import { questionsPerAttemptHint } from './questionsPerAttempt';
import type { ExamFormState } from './examFormInput';

const SHUFFLE_QUESTIONS_LABEL = 'Перемешивать вопросы';
const SHUFFLE_QUESTIONS_HINT = 'У каждого ученика свой порядок';
const SHUFFLE_OPTIONS_LABEL = 'Перемешивать варианты ответов';
const SHUFFLE_OPTIONS_HINT = 'Верный вариант не стоит на одном и том же месте';
const TIME_LIMIT_HINT = 'Пусто — без ограничения.';
// ADR-0125: срок сдачи — не лимит времени попытки, а «до какого числа её
// вообще можно начать». Идущую попытку срок не прерывает, что бы с ним ни
// случилось дальше, — только новую.
const DUE_AT_LABEL = 'Сдать до';
const DUE_AT_HINT = 'Пусто — без срока.';
const QUESTIONS_PER_ATTEMPT_LABEL = 'Вопросов ученику';

const columnStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 };

interface ExamFlowFieldsProps {
  state: ExamFormState;
  setField: <K extends keyof ExamFormState>(key: K, value: ExamFormState[K]) => void;
}

export function ExamFlowFields({ state, setField }: ExamFlowFieldsProps) {
  return (
    <div style={columnStyle}>
      <Toggle
        label={SHUFFLE_QUESTIONS_LABEL}
        hint={SHUFFLE_QUESTIONS_HINT}
        checked={state.shuffleQuestions}
        onChange={(checked) => setField('shuffleQuestions', checked)}
      />
      <Toggle
        label={SHUFFLE_OPTIONS_LABEL}
        hint={SHUFFLE_OPTIONS_HINT}
        checked={state.shuffleOptions}
        onChange={(checked) => setField('shuffleOptions', checked)}
      />

      <div className="xuanxue-form-columns">
        <Field label="Лимит времени, минут" hint={TIME_LIMIT_HINT}>
          <input
            style={numericInputStyle}
            inputMode="numeric"
            value={state.timeLimitMinText}
            onChange={(e) => setField('timeLimitMinText', e.target.value)}
          />
        </Field>

        <Field label="Попыток у ученика">
          <input
            style={numericInputStyle}
            inputMode="numeric"
            value={state.attemptsAllowedText}
            onChange={(e) => setField('attemptsAllowedText', e.target.value)}
          />
        </Field>
      </div>

      {/* Тот же контрол и формат, что «Дата и время начала» у занятия
          (planning/LessonFormFields.tsx) — второе, независимое от лимита
          времени ограничение (ADR-0125), поэтому не в сетке выше. */}
      <Field label={DUE_AT_LABEL} hint={DUE_AT_HINT}>
        <input
          type="datetime-local"
          style={inputStyle}
          value={state.dueAtLocal}
          onChange={(e) => setField('dueAtLocal', e.target.value)}
        />
      </Field>

      {/* Отдельным полем под сеткой, не третьей колонкой xuanxue-form-columns:
          у той сетки два столбца, третье поле просто съедет вниз и оставит
          пустоту рядом (сетка — CLAUDE.md «Одна механика — один компонент»,
          менять её ради одного нечастого поля незачем). */}
      <Field
        label={QUESTIONS_PER_ATTEMPT_LABEL}
        hint={questionsPerAttemptHint(state.questionIds.length)}
      >
        <input
          style={numericInputStyle}
          inputMode="numeric"
          value={state.questionsPerAttemptText}
          onChange={(e) => setField('questionsPerAttemptText', e.target.value)}
        />
      </Field>
    </div>
  );
}
