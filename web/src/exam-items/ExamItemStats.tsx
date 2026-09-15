// Развёрнутая статистика вопроса в карточке (ТЗ 4.8) — рендерится только
// когда учитель нажал «Статистика» (ExamItemCard.tsx): числа не грузятся при
// каждом взгляде на список. Скелетон вместо спиннера на загрузке —
// CLAUDE.md «Загрузка».
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { SkeletonLines } from '../components/Skeleton';
import {
  formatAskedSummary,
  formatOptionLine,
  formatUsageSummary,
} from './examItemStatsText';
import { useExamItemStats } from './useExamItemStats';

interface ExamItemStatsProps {
  itemId: string;
}

export function ExamItemStats({ itemId }: ExamItemStatsProps) {
  const { stats, loading, error, reload } = useExamItemStats(itemId);

  if (loading) return <SkeletonLines widths={['70%', '50%']} />;
  if (error) return <LoadErrorBanner message={error} onRetry={() => void reload()} />;
  if (!stats) return null;

  const usageSummary = formatUsageSummary(stats);

  return (
    <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
      <p style={{ margin: 0 }}>{formatAskedSummary(stats)}</p>
      {usageSummary && <p style={{ margin: '4px 0 0' }}>{usageSummary}</p>}
      {stats.options && stats.askedCount > 0 && (
        <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
          {stats.options.map((option) => (
            <li key={option.id}>{formatOptionLine(option)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
