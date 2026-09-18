// Числа за 30 дней вверху «Рассылок» — загрузка/скелетон/ошибка/пустая база,
// вынесено из BroadcastsScreen.tsx, чтобы экран остался ≤150 строк (CLAUDE.md
// «Храповики»). Раньше жило на отдельном экране «Сводка» — теперь у каждого
// раздела свои числа (docs/adr/0025-navigation-by-domain.md). Период вошёл в
// подпись каждой карточки («Ушло за 30 дней») — отдельной рубрики над
// сеткой карточек макет не рисует (docs/adr/0043).
import type { CSSProperties } from 'react';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { SkeletonGrid } from '../components/Skeleton';
import { SummaryNumbers } from './SummaryNumbers';
import { useSummary } from './useSummary';

const wrapperStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };

export function BroadcastsSummary() {
  const { summary, loading, error, reload } = useSummary();

  return (
    <div style={wrapperStyle}>
      {error && <LoadErrorBanner message={error} onRetry={() => void reload()} />}

      {/* Три карточки высотой около 78px (padding 16 + число 26 + зазор 2 +
          подпись 13, округлённо) — форма ближе к новой сетке, чем прежние
          пять узких строк без карточек. */}
      {loading && !error && <SkeletonGrid items={3} h={78} />}

      {!loading && !error && summary?.emptyMessage && (
        <p style={{ margin: 0 }}>{summary.emptyMessage}</p>
      )}

      {!loading && !error && summary && !summary.emptyMessage && (
        <SummaryNumbers summary={summary} />
      )}
    </div>
  );
}
