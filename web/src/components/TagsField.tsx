// Поле ввода тегов — общая механика (CLAUDE.md «Одна механика — один
// компонент») на всех пяти местах ввода: материал, дата занятия, занятие
// расписания, канал, вопрос экзамена. Компонент сам теги не разбирает: ввод
// — строка через запятую, разбор общий, parseTagsText из @xuanxue/shared
// (ADR-0058), им занимается вызывающая сторона при сохранении.
//
// Ряд нажимаемых пилюль под полем — главное здесь: даталист ненадёжен на
// телефоне (нет клавиатуры со списком у большинства мобильных браузеров), а
// учитель работает с телефона (CLAUDE.md «Мобильный экран первым»). Даталист
// остаётся рядом для десктопной клавиатуры — второй, не единственный путь.
// options — необязательны: у формы без подсказок (options не передан или
// пуст) ни даталиста, ни ряда пилюль нет вовсе, поле работает как обычный
// текстовый ввод.
import { useId, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Field, inputStyle } from './Field';
import { PILL_CLASS, pillActiveStyle, pillStyle } from './pillStyles';
import { selectedTagOptions, toggleTagInText } from '../lib/tagToggle';

const LABEL = 'Теги';
// Механика объясняется до первого нажатия (CLAUDE.md «Каждая фича объясняет
// откуда и зачем») — без этой строки пилюли выглядели бы декором, а не
// вторым способом заполнить поле.
const OPTIONS_CAPTION = 'Нажмите тег или впишите новый через запятую.';

// Стабильная ссылка по умолчанию — options ?? [] создавал бы новый массив
// на каждый рендер и обесценивал useMemo ниже (react-hooks/exhaustive-deps).
const EMPTY_OPTIONS: readonly string[] = [];

const wrapperStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8 };
const captionStyle: CSSProperties = { fontSize: 13, color: 'var(--ink-soft)', margin: 0 };
const pillRowStyle: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8 };

interface TagsFieldProps {
  value: string;
  onChange: (value: string) => void;
  hint: string;
  options?: readonly string[];
  error?: string;
}

export function TagsField({ value, onChange, hint, options, error }: TagsFieldProps) {
  // useId, не константа: два поля тегов на одной странице не должны делить
  // один id даталиста (образец использования — hooks/useHistorySheet.ts).
  const datalistId = useId();
  const tagOptions = options ?? EMPTY_OPTIONS;
  const hasOptions = tagOptions.length > 0;
  const selected = useMemo(
    () => new Set(selectedTagOptions(value, tagOptions)),
    [value, tagOptions],
  );

  return (
    <div style={wrapperStyle}>
      <Field label={LABEL} hint={hint} error={error}>
        <input
          style={inputStyle}
          list={hasOptions ? datalistId : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {hasOptions ? (
          <datalist id={datalistId}>
            {tagOptions.map((tag) => (
              <option key={tag} value={tag} />
            ))}
          </datalist>
        ) : null}
      </Field>

      {hasOptions ? (
        <div>
          <p style={captionStyle}>{OPTIONS_CAPTION}</p>
          <div
            style={pillRowStyle}
            role="group"
            aria-label={`${LABEL}: уже есть в школе`}
          >
            {tagOptions.map((tag) => (
              <button
                key={tag}
                type="button"
                className={PILL_CLASS}
                style={
                  selected.has(tag) ? { ...pillStyle, ...pillActiveStyle } : pillStyle
                }
                aria-pressed={selected.has(tag)}
                onClick={() => onChange(toggleTagInText(value, tag))}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
