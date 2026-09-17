// «Как проходит экзамен» — два переключателя с объяснением и две цифры
// (макет Form.dc.html). Перемешивание вопросов хранится у единственного
// блока, перемешивание вариантов — у самого экзамена (ADR-0033); учителю про
// это знать незачем, поэтому на экране они стоят рядом.
import type { CSSProperties } from 'react';
import { Field, inputStyle } from '../components/Field';
import { Toggle } from '../components/Toggle';
import type { ExamFormState } from './examFormInput';

const SHUFFLE_QUESTIONS_LABEL = 'Перемешивать вопросы';
const SHUFFLE_QUESTIONS_HINT = 'У каждого ученика свой порядок';
const SHUFFLE_OPTIONS_LABEL = 'Перемешивать варианты ответов';
const SHUFFLE_OPTIONS_HINT = 'Верный вариант не стоит на одном и том же месте';
const TIME_LIMIT_HINT = 'Пусто — без ограничения.';

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
            style={inputStyle}
            inputMode="numeric"
            value={state.timeLimitMinText}
            onChange={(e) => setField('timeLimitMinText', e.target.value)}
          />
        </Field>

        <Field label="Попыток у ученика">
          <input
            style={inputStyle}
            inputMode="numeric"
            value={state.attemptsAllowedText}
            onChange={(e) => setField('attemptsAllowedText', e.target.value)}
          />
        </Field>
      </div>
    </div>
  );
}
