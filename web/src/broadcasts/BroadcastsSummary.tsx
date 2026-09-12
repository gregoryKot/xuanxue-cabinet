// Числа за 30 дней вверху «Рассылок» — загрузка/скелетон/ошибка/пустая база,
// вынесено из BroadcastsScreen.tsx, чтобы экран остался ≤150 строк (CLAUDE.md
// «Храповики»). Раньше жило на отдельном экране «Сводка» — теперь у каждого
// раздела свои числа (docs/adr/0025-navigation-by-domain.md).
import type { CSSProperties } from 'react';
import { SUMMARY_PERIOD_DAYS } from '@xuanxue/shared';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { SkeletonGrid } from '../components/Skeleton';
import { SummaryNumbers } from './SummaryNumbers';
import { useSummary } from './useSummary';

const PERIOD_HEADING = `За ${SUMMARY_PERIOD_DAYS} дней`;

const wrapperStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };
const periodHeadingStyle: CSSProperties = {
  fontWeight: 600,
  fontSize: 13,
  color: 'var(--ink-soft)',
};

export function BroadcastsSummary() {
  const { summary, loading, error, reload } = useSummary();

  return (
    <div style={wrapperStyle}>
      <span style={periodHeadingStyle}>{PERIOD_HEADING}</span>

      {error && <LoadErrorBanner message={error} onRetry={() => void reload()} />}

      {loading && !error && <SkeletonGrid items={4} />}

      {!loading && !error && summary?.emptyMessage && (
        <p style={{ margin: 0 }}>{summary.emptyMessage}</p>
      )}

      {!loading && !error && summary && !summary.emptyMessage && (
        <SummaryNumbers summary={summary} />
      )}
    </div>
  );
}
