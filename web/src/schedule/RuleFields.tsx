// Правила расписания занятия — повторяемый список (день, время, длительность)
// с добавлением/удалением строк (CLAUDE.md «Одна механика — один компонент»).
// aria-label вместо видимой подписи у каждого поля строки: сама строка не
// умещает три подписанных поля на 360px, а разметку списка озвучивает legend.
// Время — type="time" (нативный пикер, без ручного разбора HH:mm);
// длительность — текст с inputMode="numeric": пустое поле не подменяется
// нулём молча, форма покажет ошибку при сохранении (ревью п.10).
import type { CSSProperties } from 'react';
import { CLASS_LIMITS, WEEKDAYS, WEEKDAY_LABELS_RU, type Weekday } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { inputStyle } from '../components/Field';
import type { RuleDraft } from './classFormInput';

const fieldsetStyle: CSSProperties = {
  border: 'none',
  padding: 0,
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};
const legendStyle: CSSProperties = { fontSize: 14, fontWeight: 600, padding: 0 };
const rowStyle: CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  flexWrap: 'wrap',
};
const narrowInputStyle: CSSProperties = { ...inputStyle, width: 90 };

const NEW_RULE: RuleDraft = { weekday: 0, time: '19:00', durationMinText: '60' };

interface RuleFieldsProps {
  rules: RuleDraft[];
  onChange: (rules: RuleDraft[]) => void;
}

export function RuleFields({ rules, onChange }: RuleFieldsProps) {
  function updateRule(index: number, patch: Partial<RuleDraft>) {
    onChange(rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));
  }

  function removeRule(index: number) {
    onChange(rules.filter((_, i) => i !== index));
  }

  return (
    <fieldset style={fieldsetStyle}>
      <legend style={legendStyle}>Дни и время</legend>
      {rules.map((rule, index) => (
        <div key={rule.id ?? `new-${index}`} style={rowStyle}>
          <select
            aria-label="День недели"
            style={narrowInputStyle}
            value={rule.weekday}
            onChange={(e) =>
              updateRule(index, { weekday: Number(e.target.value) as Weekday })
            }
          >
            {WEEKDAYS.map((day) => (
              <option key={day} value={day}>
                {WEEKDAY_LABELS_RU[day]}
              </option>
            ))}
          </select>
          <input
            type="time"
            aria-label="Время начала"
            style={narrowInputStyle}
            value={rule.time}
            onChange={(e) => updateRule(index, { time: e.target.value })}
          />
          <input
            type="text"
            inputMode="numeric"
            aria-label={`Длительность, минут (от ${CLASS_LIMITS.durationMinMin} до ${CLASS_LIMITS.durationMinMax})`}
            style={narrowInputStyle}
            value={rule.durationMinText}
            onChange={(e) => updateRule(index, { durationMinText: e.target.value })}
          />
          <Button type="button" variant="danger" onClick={() => removeRule(index)}>
            Убрать
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        onClick={() => onChange([...rules, { ...NEW_RULE }])}
      >
        Добавить время
      </Button>
      {rules.length === 0 && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-soft)' }}>
          Добавьте хотя бы один день — без этого занятие не сохранить.
        </p>
      )}
    </fieldset>
  );
}
