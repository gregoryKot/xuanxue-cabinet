// Числа за период — верх «Рассылок» (CLAUDE.md «Продуктовая фича = число в
// своём разделе», docs/adr/0025-navigation-by-domain.md). Отдельный
// компонент, чтобы сам экран остался коротким и читался сверху вниз.
import type { CSSProperties } from 'react';
import type { SummaryDto } from '@xuanxue/shared';
import { SummaryCard } from './SummaryCard';

const grid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
  gap: 10,
};

export function SummaryNumbers({ summary }: { summary: SummaryDto }) {
  return (
    <div style={grid}>
      <SummaryCard value={String(summary.broadcastsSent)} label="Рассылок отправлено" />
      <SummaryCard value={String(summary.deliveriesFailed)} label="Ошибок доставки" />
      <SummaryCard value={String(summary.deliveriesPending)} label="Ждут отправки" />
      <SummaryCard value={String(summary.manualWaiting)} label="Ждут отправки вручную" />
      {/* Ссылка ведёт в журнал ниже с готовым фильтром — «почему» смотрят там
          же, не в самих числах (docs/PLAN.md §6 «Планировщик»). */}
      <SummaryCard
        value={String(summary.broadcastsCancelled)}
        label="Отменено автоматикой"
        href="/broadcasts?status=cancelled"
      />
    </div>
  );
}
