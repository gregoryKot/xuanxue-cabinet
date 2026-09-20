// Строка поиска по уже загруженному списку — одна на весь кабинет
// (CLAUDE.md «Одна механика — один компонент», jscpd поймал вторую копию,
// когда рядом с поиском вопроса экзамена появился поиск материала занятия).
// Подпись видна плейсхолдером и скринридеру, на экране не дублируется —
// тот же приём, что у поля поиска в ListFilters.tsx.
import { inputStyle } from './Field';

interface SearchFieldProps {
  /** Она же подпись для скринридера и плейсхолдер: «Найти вопрос — по тексту
   * или тегу». Глагол в начале (docs/VOICE.md). */
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export function SearchField({ label, value, onChange }: SearchFieldProps) {
  return (
    <label>
      <span className="xuanxue-sr-only">{label}</span>
      <input
        type="search"
        style={inputStyle}
        placeholder={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
