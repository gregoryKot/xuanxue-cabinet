// Карточка «Снять кадры» раздела «Экзамены» (ADR-0182): у старых видео нет
// кадра-превью, и ученик видит чёрную плитку. Одно главное действие — кнопка;
// до нажатия карточка сама говорит, откуда число и что произойдёт. Показывается,
// только пока есть что снимать или идёт/закончился прогон.
import type { CSSProperties } from 'react';
import { Button } from '../components/Button';
import { RichText } from '../components/RichText';
import {
  formatPosterBackfillIntro,
  formatPosterBackfillStatus,
} from './examVideoPosterBackfillText';
import { useExamVideoPosterBackfill } from './useExamVideoPosterBackfill';

interface ExamVideoPosterBackfillCardProps {
  /** `withoutPosterCount` сводки; `null` — ещё грузится или сбой загрузки. */
  withoutPosterCount: number | null;
  /** Прогон кончился: экран перечитывает сводку. */
  onFinished: () => void;
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

export function ExamVideoPosterBackfillCard({
  withoutPosterCount,
  onFinished,
}: ExamVideoPosterBackfillCardProps) {
  const { state, start } = useExamVideoPosterBackfill({ onFinished });
  const intro =
    state.phase === 'idle' ? formatPosterBackfillIntro(withoutPosterCount) : null;
  const status = formatPosterBackfillStatus(state);
  if (!intro && !status) return null;

  const isRunning = state.phase === 'running';
  const isAllDone = state.phase === 'done' && !state.error && state.failed === 0;

  return (
    <section style={cardStyle} aria-label="Кадры-превью видео">
      {intro && (
        <p style={textStyle}>
          <RichText text={intro} />
        </p>
      )}
      {status && (
        <p style={state.error ? errorStyle : textStyle} aria-live="polite">
          <RichText text={status} />
        </p>
      )}
      {!isAllDone && (
        <Button pending={isRunning} onClick={() => start(withoutPosterCount)}>
          Снять кадры
        </Button>
      )}
    </section>
  );
}
