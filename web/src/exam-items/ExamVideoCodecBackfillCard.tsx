// Карточка «Перегнать видео» раздела «Экзамены» (ADR-0189): часть старых видео
// снята на iPhone в HEVC и не открывается у части учеников. Одно главное
// действие — кнопка; до нажатия карточка говорит, откуда число, что сделает
// кабинет и откуда запускать. Показывается, только пока есть что перегонять или
// идёт/закончился прогон (каркас — ExamVideoBackfillCard.tsx).
import { ExamVideoBackfillCard } from './ExamVideoBackfillCard';
import {
  formatCodecBackfillIntro,
  formatCodecBackfillStatus,
} from './examVideoCodecBackfillText';
import { useExamVideoCodecBackfill } from './useExamVideoCodecBackfill';

interface ExamVideoCodecBackfillCardProps {
  /** `codecPendingCount` сводки; `null` — ещё грузится или сбой загрузки. */
  codecPendingCount: number | null;
  /** Прогон кончился: экран перечитывает сводку (`reload` хука сводки как есть). */
  onFinished: () => void | Promise<void>;
}

export function ExamVideoCodecBackfillCard({
  codecPendingCount,
  onFinished,
}: ExamVideoCodecBackfillCardProps) {
  const { state, start } = useExamVideoCodecBackfill({ onFinished });

  return (
    <ExamVideoBackfillCard
      label="Формат видео"
      intro={state.phase === 'idle' ? formatCodecBackfillIntro(codecPendingCount) : null}
      status={formatCodecBackfillStatus(state)}
      isError={state.error !== null}
      isRunning={state.phase === 'running'}
      isAllDone={state.phase === 'done' && !state.error && state.failed === 0}
      buttonLabel="Перегнать видео"
      onStart={() => start(codecPendingCount)}
    />
  );
}
