// Одна строка варианта ответа в редакторе вопроса: отметка «верный», текст,
// тихая скрепка медиа, тихая «×» справа — одна строка вместо размазанной по
// вертикали (отзыв владельца 2026-09-27). Вынесена из
// ExamItemOptionsField.tsx — тот упёрся в 150 строк файлового храповика
// (CLAUDE.md «Храповики»), а строка и так самостоятельна: поле над ней
// держит только список и правила его изменения.
//
// Каркас — `.xuanxue-question-row` (index.css), тот же, что у строки вопроса
// экзамена, плюс модификатор `.xuanxue-option-row`: первая колонка шире, под
// цель нажатия 44×44 у отметки (CLAUDE.md «Доступность»). Сам чекбокс
// рисуется 18×18 — крупнее системный не бывает, — поэтому цель несёт <label>
// вокруг него: тот же приём, что у нижней панели вкладок и пилюль ролей, и
// именно <label>, а не <span>, чтобы нажатие по полю вокруг отметки её
// переключало.
//
// Текст, скрепка и превью медиа — один flex-ряд с переносом: скрепка
// держится рядом с текстом, а превью (`flexBasis: 100%` в
// useImageAttach/useVideoAttach) само уходит на свою строку под ними, без
// отдельной колонки для этого в разметке.
import type { CSSProperties, KeyboardEvent, Ref } from 'react';
import { EXAM_ITEM_LIMITS } from '@xuanxue/shared';
import { inputStyle } from '../components/Field';
import { rowControlStyle } from '../components/listCardStyles';
import { ExamItemOptionMedia } from './ExamItemOptionMedia';
import type { ExamVideoValue } from './examVideoFormInput';
import type { ExamItemOptionDraft } from './examItemFormInput';

const markTargetStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 44,
  height: 44,
  cursor: 'pointer',
};
const markStyle: CSSProperties = {
  width: 18,
  height: 18,
  margin: 0,
  accentColor: 'var(--accent)',
};
const contentRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 6,
};
const textStyle: CSSProperties = { ...inputStyle, flex: '1 1 140px', minWidth: 0 };

interface ExamItemOptionRowProps {
  option: ExamItemOptionDraft;
  index: number;
  /** `single` — отметка радио с общим именем группы: взаимное исключение
   * браузер делает сам. `multiple` — обычный чекбокс. */
  radioGroupName?: string;
  /** Загрузка в R2 подключена — решает, что рисует скрепка видео (ADR-0133). */
  fileStorageEnabled: boolean;
  /** Фокус текстового поля этой строки после добавления варианта (отзыв
   * владельца 2026-09-27 — печатать не кликая ещё раз) — только у только что
   * добавленной строки, у остальных `undefined`. */
  textInputRef?: Ref<HTMLInputElement>;
  onTextChange: (text: string) => void;
  onImageChange: (imageId: string | undefined) => void;
  onVideoChange: (video: ExamVideoValue) => void;
  onCorrectChange: (correct: boolean) => void;
  onRemove: () => void;
  /** Enter в текстовом поле — последний вариант добавляет следующий и
   * переводит туда фокус, остальные переводят фокус на следующий вариант
   * (ExamItemOptionsField.tsx). Сама строка не знает, какая она по счёту. */
  onEnter: () => void;
}

export function ExamItemOptionRow({
  option,
  index,
  radioGroupName,
  fileStorageEnabled,
  textInputRef,
  onTextChange,
  onImageChange,
  onVideoChange,
  onCorrectChange,
  onRemove,
  onEnter,
}: ExamItemOptionRowProps) {
  // preventDefault всегда: поле стоит внутри формы вопроса/экзамена, и Enter
  // без него отправил бы её раньше, чем учитель допечатал варианты (отзыв
  // владельца 2026-09-27).
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    onEnter();
  }

  return (
    <div className="xuanxue-question-row xuanxue-option-row">
      <label style={markTargetStyle}>
        <input
          type={radioGroupName ? 'radio' : 'checkbox'}
          name={radioGroupName}
          aria-label={`Верный вариант ${index + 1}`}
          style={markStyle}
          checked={option.correct}
          onChange={(e) => onCorrectChange(e.target.checked)}
        />
      </label>
      <div style={contentRowStyle}>
        <input
          ref={textInputRef}
          type="text"
          aria-label={`Текст варианта ${index + 1}`}
          style={textStyle}
          maxLength={EXAM_ITEM_LIMITS.optionText}
          value={option.text}
          onChange={(e) => onTextChange(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <ExamItemOptionMedia
          index={index}
          imageId={option.imageId}
          videoId={option.videoId}
          videoUrl={option.videoUrl}
          fileStorageEnabled={fileStorageEnabled}
          onImageChange={onImageChange}
          onVideoChange={onVideoChange}
        />
      </div>
      <div className="xuanxue-question-controls">
        <button
          type="button"
          style={rowControlStyle}
          aria-label={`Убрать вариант ${index + 1}`}
          onClick={onRemove}
        >
          ×
        </button>
      </div>
    </div>
  );
}
