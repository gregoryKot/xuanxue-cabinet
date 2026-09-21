// Один или несколько вариантов ответа (ТЗ п.2) — радиогруппа для «single»,
// чекбоксы для «multiple». Выбор варианта — дискретное действие, а не
// печать: сохраняем сразу после него, не ждём 2-секундный дебаунс текста.
//
// Вариант без картинок — общий Toggle (CLAUDE.md «Одна механика — один
// компонент»): нативный input под `accent-color` кабинета вместо синей
// системной галочки, строка высотой 44 (CLAUDE.md «Доступность»). Хотя бы у
// одного варианта есть картинка — вся группа переходит на плитки
// (AttemptOptionTile.tsx, docs/adr/0105): у Toggle контрол стоял отдельной
// строкой НАД картинкой, и на экране казалось, что кружок относится к
// чужому фото сверху, а не к своему снизу (жалоба владельца со снимком).
// Смешивать строку и плитку в одном вопросе не стали — текстовый вариант в
// такой группе тоже плитка, без картинки внутри.
//
// Подпись — formatOptionLabel (ADR-0035): у варианта-картинки без своего
// текста это «Вариант N», та же строка, что у бота. На экране её не видно
// (`labelHidden`) — она стояла бы прямо над самой картинкой и не говорила
// ничего (отзыв владельца 2026-09-19); доступным именем и `alt` остаётся.
import type { CSSProperties } from 'react';
import { formatOptionLabel, type AttemptOptionDto } from '@xuanxue/shared';
import { Toggle } from '../components/Toggle';
import { AttemptOptionTile } from './AttemptOptionTile';

const groupStyle: CSSProperties = { display: 'flex', flexDirection: 'column' };

interface AttemptQuestionChoiceProps {
  /** Идентификатор формулировки вопроса — она же подпись группы вариантов
   * (AttemptQuestion.tsx), своего заголовка у группы нет. */
  labelledBy: string;
  itemId: string;
  kind: 'single' | 'multiple';
  options: AttemptOptionDto[];
  selected: string[];
  /** Предпросмотр глазами ученика (exams/ExamPreviewQuestion.tsx): та же
   * строка, но ответить нельзя. */
  disabled?: boolean;
  onChange: (optionIds: string[]) => void;
}

export function AttemptQuestionChoice({
  labelledBy,
  itemId,
  kind,
  options,
  selected,
  disabled,
  onChange,
}: AttemptQuestionChoiceProps) {
  function toggle(optionId: string, checked: boolean) {
    // Радиокнопка присылает `change` только когда её выбрали: «отжать» её
    // мышью или клавиатурой нельзя, поэтому ветки «сняли отметку» у `single`
    // не существует — она была бы мёртвым кодом.
    if (kind === 'single') {
      onChange([optionId]);
      return;
    }
    onChange(
      checked ? [...selected, optionId] : selected.filter((id) => id !== optionId),
    );
  }

  const hasImages = options.some((option) => option.imageId != null);
  // Имя группы переводит контрол в радио: взаимное исключение внутри вопроса
  // браузер делает сам (комментарий в самом Toggle.tsx).
  const name = kind === 'single' ? `attempt-${itemId}` : undefined;

  return (
    <div
      role={kind === 'single' ? 'radiogroup' : 'group'}
      aria-labelledby={labelledBy}
      className={hasImages ? 'xuanxue-option-tiles' : undefined}
      style={hasImages ? undefined : groupStyle}
    >
      {options.map((option, index) => {
        const label = formatOptionLabel(option.text, index);
        // Своего текста нет, а картинка есть — «Вариант N» видно не будет:
        // подпись остаётся доступным именем и `alt` картинки (Toggle.tsx,
        // AttemptOptionTile.tsx).
        const labelHidden = !option.text && option.imageId != null;
        const checked = selected.includes(option.id);
        return hasImages ? (
          <AttemptOptionTile
            key={option.id}
            label={label}
            labelHidden={labelHidden}
            imageId={option.imageId}
            checked={checked}
            disabled={disabled}
            name={name}
            onChange={(next) => toggle(option.id, next)}
          />
        ) : (
          <Toggle
            key={option.id}
            label={label}
            labelHidden={labelHidden}
            checked={checked}
            disabled={disabled}
            name={name}
            onChange={(next) => toggle(option.id, next)}
          />
        );
      })}
    </div>
  );
}
