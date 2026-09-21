// Общий select кабинета (CLAUDE.md «Одна механика — один компонент»): раньше
// стиль селекта собирался по месту восемь раз из inputStyle, и ни один не
// рисовал свой значок — `appearance` в проекте не встречался вовсе, браузер
// рисовал системную стрелку и прижимал её к самому краю поля. Единственный
// отступ справа был общим `padding` из getInputStyle, стрелке не хватало
// своего места (снимок владельца 2026-09-21, экран «Рассылки»: «стрелочка у
// 2 недель как-то некрасиво прижата»). Системная стрелка к тому же рисуется
// не в палитре кабинета (docs/adr/0043) и на тёплой бумаге смотрится чужой.
import type { CSSProperties, SelectHTMLAttributes } from 'react';
import { ChevronIcon } from './ChevronIcon';
import { getInputStyle } from './Field';

// Место под свой значок: 12px сам значок (ChevronIcon.tsx) + 12px тот же
// правый отступ, что у текста слева (getInputStyle: padding '10px 12px'),
// плюс зазор между ними.
const ARROW_RIGHT_PX = 12;
const SELECT_PADDING_RIGHT_PX = 34;

const selectStyle: CSSProperties = {
  ...getInputStyle(),
  // Снимаем системную стрелку. Без вендорных префиксов Safari и старый
  // Firefox appearance игнорируют и продолжают рисовать свою — `appearance`
  // без приставки эти движки понимать стали не так давно.
  appearance: 'none',
  WebkitAppearance: 'none',
  MozAppearance: 'none',
  paddingRight: SELECT_PADDING_RIGHT_PX,
  cursor: 'pointer',
  // Геометрию (ширину) задаёт обёртка через свой `style` — сам select всегда
  // занимает её целиком.
  width: '100%',
  // Тушью явно, а не `inherit` из getInputStyle: обёртка ниже приглушена под
  // цвет значка, и по наследству потускнел бы сам выбранный ответ. Ответ
  // человека читается наравне с тем, что он набрал в соседнем поле, — в
  // кабинете это один вес (Field.tsx, inputStyle).
  color: 'var(--ink)',
};

const arrowStyle: CSSProperties = {
  position: 'absolute',
  top: '50%',
  right: ARROW_RIGHT_PX,
  transform: 'translateY(-50%)',
  // Без этого клик по значку не долетает до select под ним, и список не
  // открывается — только по тексту левее стрелки.
  pointerEvents: 'none',
};

const wrapStyle: CSSProperties = {
  position: 'relative',
  display: 'block',
  // Тон задан обёртке, а не самому значку: тот читает currentColor. Выбранное
  // значение этот тон не подхватывает — selectStyle выше красит текст тушью
  // явно.
  color: 'var(--ink-soft)',
};

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'style'> {
  /** Геометрию (ширину) задаёт вызывающая сторона обёртке — например, узкому
   * селекту дня недели в RuleFields.tsx нужны те же 90px, что у соседних
   * полей строки. Сам `<select>` всегда растянут на 100% этой ширины. */
  style?: CSSProperties;
}

export function Select({ style, children, ...selectProps }: SelectProps) {
  return (
    <span style={{ ...wrapStyle, ...style }}>
      <select {...selectProps} style={selectStyle}>
        {children}
      </select>
      {/* Тот же шеврон, что у раскрывающейся текстовой кнопки — общий
          компонент, а не второй такой же svg по месту (CLAUDE.md «Одна
          механика — один компонент»). */}
      <ChevronIcon style={arrowStyle} />
    </span>
  );
}
