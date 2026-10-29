// Карточка «Снять кадры» раздела «Экзамены» (ADR-0182): у старых видео нет
// кадра-превью, и ученик видит чёрную плитку. Одно главное действие — кнопка;
// до нажатия карточка сама говорит, откуда число и что произойдёт. Показывается,
// только пока есть что снимать или идёт/закончился прогон (каркас —
// ExamVideoBackfillCard.tsx).
import { ExamVideoBackfillCard } from './ExamVideoBackfillCard';
import {
  formatPosterBackfillIntro,
  formatPosterBackfillStatus,
} from './examVideoPosterBackfillText';
import { useExamVideoPosterBackfill } from './useExamVideoPosterBackfill';

interface ExamVideoPosterBackfillCardProps {
  /** `withoutPosterCount` сводки; `null` — ещё грузится или сбой загрузки. */
  withoutPosterCount: number | null;
  /** Прогон кончился: экран перечитывает сводку (`reload` хука сводки как есть). */
  onFinished: () => void | Promise<void>;
}

export function ExamVideoPosterBackfillCard({
  withoutPosterCount,
  onFinished,
}: ExamVideoPosterBackfillCardProps) {
  const { state, start } = useExamVideoPosterBackfill({ onFinished });

  return (
    <ExamVideoBackfillCard
      label="Кадры-превью видео"
      intro={
        state.phase === 'idle' ? formatPosterBackfillIntro(withoutPosterCount) : null
      }
      status={formatPosterBackfillStatus(state)}
      isError={state.error !== null}
      isRunning={state.phase === 'running'}
      isAllDone={state.phase === 'done' && !state.error && state.failed === 0}
      buttonLabel="Снять кадры"
      onStart={() => start(withoutPosterCount)}
    />
  );
}
