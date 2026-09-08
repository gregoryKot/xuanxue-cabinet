// Первый экран после входа (docs/PLAN.md §6 п.7, маршрут `/` → `/summary`).
// Объясняет за пять секунд, что здесь и зачем (CLAUDE.md «Продукт»), дальше —
// числа за 30 дней; пустая база — честное `emptyMessage` из API, а не нули
// (CLAUDE.md «Продуктовая фича = число в „Сводке“»).
import type { CSSProperties } from 'react';
import { SUMMARY_PERIOD_DAYS } from '@xuanxue/shared';
import { formatDateTime } from '../lib/formatDate';
import { SkeletonGrid } from '../components/Skeleton';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { screenExplanationStyle, screenSectionStyle } from '../components/screenLayout';
import { SummaryCard } from './SummaryCard';
import { useSummary } from './useSummary';

const EXPLANATION = `Здесь сводка за последние ${SUMMARY_PERIOD_DAYS} дней: сколько постов ушло, что не отправилось и какое занятие ближе всего.`;

const grid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
  gap: 10,
};

export default function SummaryScreen() {
  const { summary, loading, error, reload } = useSummary();

  return (
    <section style={screenSectionStyle}>
      <p style={screenExplanationStyle}>{EXPLANATION}</p>

      {error && <LoadErrorBanner message={error} onRetry={() => void reload()} />}

      {loading && !error && <SkeletonGrid items={4} />}

      {!loading && !error && summary?.emptyMessage && (
        <p style={{ margin: 0 }}>{summary.emptyMessage}</p>
      )}

      {!loading && !error && summary && !summary.emptyMessage && (
        <div style={grid}>
          <SummaryCard
            value={String(summary.broadcastsSent)}
            label="Рассылок отправлено"
          />
          <SummaryCard value={String(summary.deliveriesFailed)} label="Ошибок доставки" />
          <SummaryCard value={String(summary.deliveriesPending)} label="Ждут отправки" />
          {/* Без href: маршрута «Рассылки» в этом патче ещё нет, ссылку
              добавит K3 (catch-all иначе увёл бы обратно на «Сводку»). */}
          <SummaryCard
            value={String(summary.manualWaiting)}
            label="Ждут отправки вручную"
          />
          {/* Ссылка ведёт в журнал с готовым фильтром — «почему» смотрят там
              же, не на самой «Сводке» (docs/PLAN.md §6 «Планировщик»). */}
          <SummaryCard
            value={String(summary.broadcastsCancelled)}
            label="Отменено автоматикой"
            href="/broadcasts?status=cancelled"
          />
          {summary.nextLesson && (
            <SummaryCard
              value={formatDateTime(summary.nextLesson.startsAt)}
              label={`Ближайшее занятие — ${summary.nextLesson.title}`}
              href={`/planning#lesson-${summary.nextLesson.lessonId}`}
            />
          )}
        </div>
      )}
    </section>
  );
}
