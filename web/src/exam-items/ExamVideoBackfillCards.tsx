// Карточки-прогоны по старым видео вопросов в разделе «Экзамены»: кадры-превью
// (ADR-0182) и формат (ADR-0189). Одним блоком, чтобы ExamsScreen не рос с каждой
// новой кнопкой (файловый лимит, CLAUDE.md «Храповики»). Обе перечитывают сводку
// по окончании, так что число на экране остаётся настоящим.
import type { ExamVideoStatsDto } from '@xuanxue/shared';
import { ExamVideoCodecBackfillCard } from './ExamVideoCodecBackfillCard';
import { ExamVideoPosterBackfillCard } from './ExamVideoPosterBackfillCard';

interface ExamVideoBackfillCardsProps {
  /** Сводка по видео; `null` — ещё грузится или сбой загрузки. */
  stats: ExamVideoStatsDto | null;
  /** Прогон кончился: экран перечитывает сводку (`reload` хука сводки как есть). */
  onFinished: () => void | Promise<void>;
}

export function ExamVideoBackfillCards({
  stats,
  onFinished,
}: ExamVideoBackfillCardsProps) {
  return (
    <>
      <ExamVideoPosterBackfillCard
        withoutPosterCount={stats?.withoutPosterCount ?? null}
        onFinished={onFinished}
      />
      <ExamVideoCodecBackfillCard
        codecPendingCount={stats?.codecPendingCount ?? null}
        onFinished={onFinished}
      />
    </>
  );
}
