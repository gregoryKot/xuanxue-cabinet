// Первый экран после входа (docs/PLAN.md §6 п.7, маршрут `/` → `/summary`).
// Сверху — что сегодня, дальше числа за 30 дней: учитель открывает кабинет
// перед занятием, а не ради статистики (отзыв владельца 2026-09-12).
// Пустая база — честное `emptyMessage` из API, а не нули (CLAUDE.md
// «Продуктовая фича = число в „Сводке“»).
import { useMemo, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { SUMMARY_PERIOD_DAYS } from '@xuanxue/shared';
import { useAuth } from '../auth/AuthProvider';
import { hasRole } from '../auth/hasRole';
import { SkeletonGrid } from '../components/Skeleton';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { screenExplanationStyle, screenSectionStyle } from '../components/screenLayout';
import { useLessons } from '../planning/useLessons';
import { useClasses } from '../schedule/useClasses';
import { SummaryNumbers } from './SummaryNumbers';
import { TodaySection } from './TodaySection';
import { pickTodayLessons } from './todayLessons';
import { useSummary } from './useSummary';

const EXPLANATION =
  'Здесь видно, что у вас сегодня и что кабинет сделал сам за последний месяц.';
const PERIOD_HEADING = `За ${SUMMARY_PERIOD_DAYS} дней`;
const PEOPLE_LINK_HINT = 'кто вошёл в кабинет и кто ведёт занятия';

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
const periodHeadingStyle: CSSProperties = {
  fontWeight: 600,
  fontSize: 13,
  color: 'var(--ink-soft)',
};

export default function SummaryScreen() {
  const { me } = useAuth();
  const { summary, loading, error, reload } = useSummary();
  const lessonsState = useLessons();
  const classesState = useClasses();
  const isAdmin = hasRole(me, 'admin');

  const todayLessons = useMemo(
    () => (lessonsState.lessons ? pickTodayLessons(lessonsState.lessons) : null),
    [lessonsState.lessons],
  );
  const classTitleById = useMemo(
    () => new Map((classesState.classes ?? []).map((cls) => [cls.id, cls.title])),
    [classesState.classes],
  );

  return (
    <section style={screenSectionStyle}>
      <p style={screenExplanationStyle}>{EXPLANATION}</p>

      <TodaySection
        lessons={todayLessons}
        classTitleById={classTitleById}
        error={lessonsState.error}
        onRetry={() => void lessonsState.reload()}
        nextLesson={summary?.nextLesson}
      />

      <span style={periodHeadingStyle}>{PERIOD_HEADING}</span>

      {error && <LoadErrorBanner message={error} onRetry={() => void reload()} />}

      {loading && !error && <SkeletonGrid items={4} />}

      {!loading && !error && summary?.emptyMessage && (
        <p style={{ margin: 0 }}>{summary.emptyMessage}</p>
      )}

      {!loading && !error && summary && !summary.emptyMessage && (
        <SummaryNumbers summary={summary} />
      )}

      {/* Вход на «Люди» — назначение ролей учитель/админ (RequireAdmin,
          App.tsx). Не в NAV_ITEMS: три пункта — весь низ экрана
          (navItems.ts). */}
      {isAdmin && (
        <div>
          <Link to="/people" style={peopleLinkStyle}>
            Люди
          </Link>
          <p style={peopleLinkHintStyle}>{PEOPLE_LINK_HINT}</p>
        </div>
      )}
    </section>
  );
}
