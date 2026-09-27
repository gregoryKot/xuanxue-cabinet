// Варианты ответа — только для single/multiple: добавить, убрать, отметить
// верный, дать текст и/или картинку (ADR-0035). Строка со всей вёрсткой —
// ExamItemOptionRow.tsx, фокус после добавления (отзыв владельца
// 2026-09-27) — useOptionInputFocus.ts; оба вынесены по файловому
// храповику (CLAUDE.md «Храповики»), здесь — только список и правила его
// изменения. Отметка «верно» — нативный radio/checkbox: для single имя
// группы (`name`) отдаёт браузеру взаимное исключение самому, для multiple —
// обычные чекбоксы (CLAUDE.md «Доступность»).
import type { CSSProperties } from 'react';
import { EXAM_ITEM_LIMITS, type ExamItemKind } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { RichText } from '../components/RichText';
import { ExamItemOptionRow } from './ExamItemOptionRow';
import { useOptionInputFocus } from './useOptionInputFocus';
import type { ExamVideoValue } from './examVideoFormInput';
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
const addButtonStyle: CSSProperties = { alignSelf: 'flex-start' };

const RADIO_GROUP_NAME = 'exam-item-correct-option';
const NEW_OPTION: ExamItemOptionDraft = { text: '', correct: false };
const ADD_LABEL = 'Добавить вариант';

// Число — из EXAM_ITEM_LIMITS, поэтому строится функцией, не хранится
// готовой строкой.
function minOptionsHint(min: number): string {
  return `Добавьте минимум **${min}** варианта — без них вопрос не сохранить.`;
}

interface ExamItemOptionsFieldProps {
  kind: ExamItemKind;
  options: ExamItemOptionDraft[];
  /** Загрузка в R2 подключена — решает, что рисует поле видео варианта
   * (ADR-0133). */
  fileStorageEnabled: boolean;
  onChange: (options: ExamItemOptionDraft[]) => void;
}

export function ExamItemOptionsField({
  kind,
  options,
  fileStorageEnabled,
  onChange,
}: ExamItemOptionsFieldProps) {
  const canAddMore = options.length < EXAM_ITEM_LIMITS.optionsMax;
  const { registerInput, markFocusNext, focusIndex } = useOptionInputFocus(
    options.length,
  );

  function addOption() {
    if (!canAddMore) return;
    markFocusNext();
    onChange([...options, { ...NEW_OPTION }]);
  }

  // Enter в последнем варианте — как кнопка «Добавить вариант»; в остальных
  // переводит фокус на соседний (preventDefault — в ExamItemOptionRow.tsx).
  function handleEnter(index: number) {
    if (index === options.length - 1) {
      addOption();
      return;
    }
    focusIndex(index + 1);
  }

  function updateText(index: number, text: string) {
    onChange(options.map((option, i) => (i === index ? { ...option, text } : option)));
  }

  // Картинка снимает видео варианта — взаимоисключение (ADR-0133).
  function updateImage(index: number, imageId: string | undefined) {
    onChange(
      options.map((option, i) =>
        i === index
          ? { ...option, imageId, videoId: undefined, videoUrl: undefined }
          : option,
      ),
    );
  }

  function updateVideo(index: number, video: ExamVideoValue) {
    onChange(
      options.map((o, i) => (i === index ? { ...o, imageId: undefined, ...video } : o)),
    );
  }

  // single — отметка любого варианта снимает остальные (React держит
  // состояние сам, радио в DOM тут не решает).
  function markCorrect(index: number, checked: boolean) {
    if (kind === 'single') {
      onChange(options.map((o, i) => ({ ...o, correct: i === index })));
      return;
    }
    onChange(options.map((o, i) => (i === index ? { ...o, correct: checked } : o)));
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
          fileStorageEnabled={fileStorageEnabled}
          textInputRef={registerInput(index)}
          onTextChange={(text) => updateText(index, text)}
          onImageChange={(imageId) => updateImage(index, imageId)}
          onVideoChange={(video) => updateVideo(index, video)}
          onCorrectChange={(checked) => markCorrect(index, checked)}
          onRemove={() => removeOption(index)}
          onEnter={() => handleEnter(index)}
        />
      ))}
      {canAddMore && (
        <Button variant="secondary" style={addButtonStyle} onClick={addOption}>
          {ADD_LABEL}
        </Button>
      )}
      {options.length < EXAM_ITEM_LIMITS.optionsMin && (
        <p style={hintTextStyle}>
          <RichText text={minOptionsHint(EXAM_ITEM_LIMITS.optionsMin)} />
        </p>
      )}
    </fieldset>
  );
}
