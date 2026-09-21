// Варианты ответа — только для single/multiple: добавить, убрать, отметить
// верный, дать текст и/или картинку (ADR-0035). Сама строка со всей вёрсткой
// живёт в ExamItemOptionRow.tsx (вынесена по файловому храповику), здесь —
// список и правила его изменения. Отметка «верно» — нативный radio/checkbox:
// для single имя группы (`name`) отдаёт браузеру взаимное исключение самому,
// для multiple — обычные чекбоксы (CLAUDE.md «Доступность» — работает с
// клавиатуры без единого атрибута ARIA).
import type { CSSProperties } from 'react';
import { EXAM_ITEM_LIMITS, type ExamItemKind } from '@xuanxue/shared';
import { noteStyle } from '../components/screenLayout';
import { TextLinkButton } from '../components/TextLinkButton';
import { ExamItemOptionRow } from './ExamItemOptionRow';
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
const hintTextStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: 'var(--ink-soft)',
};

const RADIO_GROUP_NAME = 'exam-item-correct-option';
const NEW_OPTION: ExamItemOptionDraft = { text: '', correct: false };
const HELP_TEXT =
  'Вариант — текст, картинка или и то и другое. Фото ужимается до 1280 px перед отправкой.';

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

  function updateImage(index: number, imageId: string | undefined) {
    onChange(options.map((option, i) => (i === index ? { ...option, imageId } : option)));
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
        <ExamItemOptionRow
          key={option.id ?? `new-${index}`}
          option={option}
          index={index}
          radioGroupName={kind === 'single' ? RADIO_GROUP_NAME : undefined}
          onTextChange={(text) => updateText(index, text)}
          onImageChange={(imageId) => updateImage(index, imageId)}
          onCorrectChange={(checked) => markCorrect(index, checked)}
          onRemove={() => removeOption(index)}
        />
      ))}
      {canAddMore && (
        <TextLinkButton onClick={() => onChange([...options, { ...NEW_OPTION }])}>
          Добавить вариант
        </TextLinkButton>
      )}
      {options.length < EXAM_ITEM_LIMITS.optionsMin && (
        <p style={hintTextStyle}>
          Добавьте минимум {EXAM_ITEM_LIMITS.optionsMin} варианта — без них вопрос не
          сохранить.
        </p>
      )}
      <p style={noteStyle}>{HELP_TEXT}</p>
    </fieldset>
  );
}
