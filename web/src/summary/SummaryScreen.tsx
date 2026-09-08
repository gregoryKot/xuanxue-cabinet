// Первый экран после входа (docs/PLAN.md §6 п.7, маршрут `/` → `/summary`).
// Объясняет за пять секунд, что здесь и зачем (CLAUDE.md «Продукт»), дальше —
// числа за 30 дней; пустая база — честное `emptyMessage` из API, а не нули
// (CLAUDE.md «Продуктовая фича = число в „Сводке“»).
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { SUMMARY_PERIOD_DAYS } from '@xuanxue/shared';
import { useAuth } from '../auth/AuthProvider';
import { hasRole } from '../auth/hasRole';
import { formatDateTime } from '../lib/formatDate';
import { SkeletonGrid } from '../components/Skeleton';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { screenExplanationStyle, screenSectionStyle } from '../components/screenLayout';
import { SummaryCard } from './SummaryCard';
import { useSummary } from './useSummary';

const EXPLANATION = `Здесь сводка за последние ${SUMMARY_PERIOD_DAYS} дней: сколько постов ушло, что не отправилось и какое занятие ближе всего.`;
const PEOPLE_LINK_HINT = 'кто вошёл в кабинет и кто ведёт занятия';

const grid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
  gap: 10,
};

// Не SummaryCard: там число — здесь ссылка без числа (не путать «сколько
// людей» с настройкой ролей, PLAN §6 п.7 явно оставляет числа отдельно).
const peopleLinkStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 44,
  padding: '10px 16px',
  borderRadius: 12,
  border: '1px solid var(--border)',
  background: '#fff',
  textDecoration: 'none',
  color: 'inherit',
  fontWeight: 600,
  width: 'fit-content',
};
const peopleLinkHintStyle: CSSProperties = {
  margin: '4px 0 0',
  fontSize: 13,
  color: 'var(--ink-soft)',
};

export default function SummaryScreen() {
  const { me } = useAuth();
  const { summary, loading, error, reload } = useSummary();
  const isAdmin = hasRole(me, 'admin');

  return (
    <section style={screenSectionStyle}>
      <p style={screenExplanationStyle}>{EXPLANATION}</p>

      {/* Вход на «Люди» — назначение ролей учитель/админ (RequireAdmin,
          App.tsx). Не в NAV_ITEMS: 6 пунктов — предел на 360px
          (navItems.ts). */}
      {isAdmin && (
        <div>
          <Link to="/people" style={peopleLinkStyle}>
            Люди
          </Link>
          <p style={peopleLinkHintStyle}>{PEOPLE_LINK_HINT}</p>
        </div>
      )}

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
