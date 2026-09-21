// Одна строка варианта ответа в редакторе вопроса: отметка «верный»,
// [текст + картинка] одной колонкой, тихая «×» справа. Вынесена из
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
import type { CSSProperties } from 'react';
import { EXAM_ITEM_LIMITS } from '@xuanxue/shared';
import { inputStyle } from '../components/Field';
import { rowControlStyle } from '../components/listCardStyles';
import { ExamItemOptionImage } from './ExamItemOptionImage';
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
const textColumnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};
const textStyle: CSSProperties = { ...inputStyle, marginTop: 2 };

interface ExamItemOptionRowProps {
  option: ExamItemOptionDraft;
  index: number;
  /** `single` — отметка радио с общим именем группы: взаимное исключение
   * браузер делает сам. `multiple` — обычный чекбокс. */
  radioGroupName?: string;
  onTextChange: (text: string) => void;
  onImageChange: (imageId: string | undefined) => void;
  onCorrectChange: (correct: boolean) => void;
  onRemove: () => void;
}

export function ExamItemOptionRow({
  option,
  index,
  radioGroupName,
  onTextChange,
  onImageChange,
  onCorrectChange,
  onRemove,
}: ExamItemOptionRowProps) {
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
      <div style={textColumnStyle}>
        <input
          type="text"
          aria-label={`Текст варианта ${index + 1}`}
          style={textStyle}
          maxLength={EXAM_ITEM_LIMITS.optionText}
          value={option.text}
          onChange={(e) => onTextChange(e.target.value)}
        />
        <ExamItemOptionImage
          index={index}
          imageId={option.imageId}
          onChange={onImageChange}
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
