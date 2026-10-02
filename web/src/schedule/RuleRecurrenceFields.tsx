// «Как часто» у правила расписания (ADR-0168): каждую неделю или раз в две
// недели, и для второго — дата первого занятия. Подписи видимые, в отличие от
// трёх полей строки выше: здесь места хватает, а «Первое занятие» без слова
// рядом с датой никто бы не угадал. Подсказка объясняет, зачем дата, ещё до
// того, как человек её выберет (CLAUDE.md «Каждая фича объясняет „зачем“»).
import type { CSSProperties } from 'react';
import {
  EVERY_TWO_WEEKS,
  EVERY_WEEK,
  EVERY_WEEKS_LABELS_RU,
  RULE_EVERY_WEEKS,
  WEEKDAY_ACCUSATIVE_RU,
  type RuleEveryWeeks,
} from '@xuanxue/shared';
import { Field, inputStyle } from '../components/Field';
import { Select } from '../components/Select';
import type { RuleDraft } from './ruleDraft';

const rowStyle: CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'flex-start',
  flexWrap: 'wrap',
};
const selectWrapStyle: CSSProperties = { width: 190 };
// Подсказка под датой занимает полторы строки: без своей базовой ширины Field
// растянулся бы по тексту и ушёл бы на следующую строку целиком даже там, где
// рядом с выбором частоты хватает места.
const dateFieldStyle: CSSProperties = { flex: '1 1 220px', minWidth: 0 };
const dateInputStyle: CSSProperties = { ...inputStyle, width: 170 };

interface RuleRecurrenceFieldsProps {
  rule: RuleDraft;
  onChange: (patch: Partial<RuleDraft>) => void;
}

export function RuleRecurrenceFields({ rule, onChange }: RuleRecurrenceFieldsProps) {
  // Строка из черновика, записанного до ADR-0168, полей не несёт (RuleDraft).
  const everyWeeks = rule.everyWeeks ?? EVERY_WEEK;
  return (
    <div style={rowStyle}>
      <Field label="Как часто">
        <Select
          style={selectWrapStyle}
          value={everyWeeks}
          onChange={(e) =>
            onChange({ everyWeeks: Number(e.target.value) as RuleEveryWeeks })
          }
        >
          {RULE_EVERY_WEEKS.map((choice) => (
            <option key={choice} value={choice}>
              {EVERY_WEEKS_LABELS_RU[choice]}
            </option>
          ))}
        </Select>
      </Field>
      {everyWeeks === EVERY_TWO_WEEKS && (
        <div style={dateFieldStyle}>
          <Field
            label="Первое занятие"
            hint={`От этой даты занятие идёт через неделю. Выберите **${WEEKDAY_ACCUSATIVE_RU[rule.weekday]}**.`}
          >
            <input
              type="date"
              style={dateInputStyle}
              value={rule.startsOn ?? ''}
              onChange={(e) => onChange({ startsOn: e.target.value })}
            />
          </Field>
        </div>
      )}
    </div>
  );
}
