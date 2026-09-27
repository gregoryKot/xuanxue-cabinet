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
import { RichText } from '../components/RichText';
import { TextLinkButton } from '../components/TextLinkButton';
import { ExamItemOptionRow } from './ExamItemOptionRow';
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

const RADIO_GROUP_NAME = 'exam-item-correct-option';
const NEW_OPTION: ExamItemOptionDraft = { text: '', correct: false };
const HELP_TEXT =
  'Вариант — текст, картинка или видео, не больше одного медиа разом. ' +
  'Фото ужимается до **1280 px** перед отправкой.';

/** Подсказка о минимуме вариантов — число берётся из общего лимита
 * (EXAM_ITEM_LIMITS), поэтому строится функцией, а не хранится константой
 * со звёздочками текстом (RichText разбирает готовую строку). */
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

  function updateText(index: number, text: string) {
    onChange(options.map((option, i) => (i === index ? { ...option, text } : option)));
  }

  // Картинка и видео — взаимоисключающие (ADR-0133): новая картинка снимает
  // видео варианта, которое уже могло стоять, а не остаётся молча висеть за
  // кадром до следующего PATCH.
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
      options.map((option, i) =>
        i === index ? { ...option, imageId: undefined, ...video } : option,
      ),
    );
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
          fileStorageEnabled={fileStorageEnabled}
          onTextChange={(text) => updateText(index, text)}
          onImageChange={(imageId) => updateImage(index, imageId)}
          onVideoChange={(video) => updateVideo(index, video)}
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
          <RichText text={minOptionsHint(EXAM_ITEM_LIMITS.optionsMin)} />
        </p>
      )}
      <p style={noteStyle}>
        <RichText text={HELP_TEXT} />
      </p>
    </fieldset>
  );
}
