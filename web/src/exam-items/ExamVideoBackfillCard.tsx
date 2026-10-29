// Каркас карточек-прогонов раздела «Экзамены»: «Снять кадры» (ADR-0182) и
// «Перегнать видео» (ADR-0189). Обе делают одно: объясняют, откуда число и что
// будет, показывают ход прогона и держат одну главную кнопку. Общий каркас, а не
// две копии разметки (CLAUDE.md «Одна механика — один компонент»).
import type { CSSProperties } from 'react';
import { Button } from '../components/Button';
import { RichText } from '../components/RichText';

export interface ExamVideoBackfillCardProps {
  /** Название секции для чтения с экрана. */
  label: string;
  /** Объяснение до первого нажатия; `null` — после нажатия или когда делать нечего. */
  intro: string | null;
  /** Ход прогона и итог; `null` — прогона не было. */
  status: string | null;
  /** `status` — ошибка, прогон оборвался. */
  isError: boolean;
  isRunning: boolean;
  /** Всё сделано без осечек: кнопка больше не нужна. */
  isAllDone: boolean;
  buttonLabel: string;
  onStart: () => void;
}

const cardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 10,
  padding: '16px 18px',
  borderRadius: 'var(--radius-block)',
  border: '1px solid var(--line-soft)',
};
const textStyle: CSSProperties = {
  margin: 0,
  fontSize: 14,
  lineHeight: 1.5,
  color: 'var(--ink-soft)',
};
const errorStyle: CSSProperties = { ...textStyle, color: 'var(--danger)' };

/** Показывается, только пока есть что сказать: объяснение или ход прогона. */
export function ExamVideoBackfillCard({
  label,
  intro,
  status,
  isError,
  isRunning,
  isAllDone,
  buttonLabel,
  onStart,
}: ExamVideoBackfillCardProps) {
  if (!intro && !status) return null;
  return (
    <section style={cardStyle} aria-label={label}>
      {intro && (
        <p style={textStyle}>
          <RichText text={intro} />
        </p>
      )}
      {status && (
        <p style={isError ? errorStyle : textStyle} aria-live="polite">
          <RichText text={status} />
        </p>
      )}
      {!isAllDone && (
        <Button pending={isRunning} onClick={onStart}>
          {buttonLabel}
        </Button>
      )}
    </section>
  );
}
