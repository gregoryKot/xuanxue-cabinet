// Варианты ответа — только для single/multiple (ТЗ 4.2, «Лист»): добавить,
// убрать, отметить верный. По образцу schedule/RuleFields.tsx (повторяемый
// список строк с добавлением/удалением). Отметка «верно» — нативный
// radio/checkbox: для single имя группы (`name`) отдаёт браузеру взаимное
// исключение самому, для multiple — обычные чекбоксы (CLAUDE.md
// «Доступность» — работает с клавиатуры без единого атрибута ARIA).
import type { CSSProperties } from 'react';
import { EXAM_ITEM_LIMITS, type ExamItemKind } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { inputStyle } from '../components/Field';
import type { ExamItemOptionDraft } from './examItemFormInput';

const fieldsetStyle: CSSProperties = {
  border: 'none',
  padding: 0,
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};
const legendStyle: CSSProperties = { fontSize: 14, fontWeight: 600, padding: 0 };
const rowStyle: CSSProperties = { display: 'flex', gap: 8, alignItems: 'center' };
const markStyle: CSSProperties = { width: 22, height: 22, flexShrink: 0 };
const hintTextStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: 'var(--ink-soft)',
};

const RADIO_GROUP_NAME = 'exam-item-correct-option';
const NEW_OPTION: ExamItemOptionDraft = { text: '', correct: false };

interface ExamItemOptionsFieldProps {
  kind: ExamItemKind;
  options: ExamItemOptionDraft[];
  onChange: (options: ExamItemOptionDraft[]) => void;
}

export function ExamItemOptionsField({
  kind,
  options,
  onChange,
}: ExamItemOptionsFieldProps) {
  const canAddMore = options.length < EXAM_ITEM_LIMITS.optionsMax;

  function updateText(index: number, text: string) {
    onChange(options.map((option, i) => (i === index ? { ...option, text } : option)));
  }

  function markCorrect(index: number, checked: boolean) {
    // single — ровно один верный: отметка любого варианта снимает остальные,
    // а не только ставит текущий (радио сделал бы то же в DOM, но React
    // держит состояние здесь — синхронизируем явно).
    if (kind === 'single') {
      onChange(options.map((option, i) => ({ ...option, correct: i === index })));
      return;
    }
    onChange(
      options.map((option, i) =>
        i === index ? { ...option, correct: checked } : option,
      ),
    );
  }

  function removeOption(index: number) {
    onChange(options.filter((_, i) => i !== index));
  }

  return (
    <fieldset style={fieldsetStyle}>
      <legend style={legendStyle}>Варианты ответа</legend>
      {options.map((option, index) => (
        <div key={option.id ?? `new-${index}`} style={rowStyle}>
          <input
            type={kind === 'single' ? 'radio' : 'checkbox'}
            name={kind === 'single' ? RADIO_GROUP_NAME : undefined}
            aria-label={`Верный вариант ${index + 1}`}
            style={markStyle}
            checked={option.correct}
            onChange={(e) => markCorrect(index, e.target.checked)}
          />
          <input
            type="text"
            aria-label={`Текст варианта ${index + 1}`}
            style={{ ...inputStyle, flex: 1 }}
            maxLength={EXAM_ITEM_LIMITS.optionText}
            value={option.text}
            onChange={(e) => updateText(index, e.target.value)}
          />
          <Button type="button" variant="danger" onClick={() => removeOption(index)}>
            Убрать
          </Button>
        </div>
      ))}
      {canAddMore && (
        <Button
          type="button"
          variant="secondary"
          onClick={() => onChange([...options, { ...NEW_OPTION }])}
        >
          Добавить вариант
        </Button>
      )}
      {options.length < EXAM_ITEM_LIMITS.optionsMin && (
        <p style={hintTextStyle}>
          Добавьте минимум {EXAM_ITEM_LIMITS.optionsMin} варианта — без них вопрос не
          сохранить.
        </p>
      )}
    </fieldset>
  );
}
