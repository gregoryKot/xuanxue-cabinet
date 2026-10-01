// Строка «сколько учеников выбрали свои занятия и время» под школьным «за
// сколько минут напомнить» на «Шаблонах» (ADR-0162, п. 5). Это число раздела
// для штата, а не общей «Сводки» (ADR-0025): рядом с настройкой, которую
// ученик может переопределить, видно, как часто он это делает.
// Загрузка — скелетон строки; сбой — тихая приписка без красного баннера: число
// второстепенное, остальной экран от него не зависит.
import { RichText } from '../components/RichText';
import { noteStyle } from '../components/screenLayout';
import { SkeletonLines } from '../components/Skeleton';
import { formatLessonPrefsStats } from './lessonPrefsStatsText';
import { useLessonPrefsStats } from './useLessonPrefsStats';

const SKELETON_WIDTHS = ['70%'];

export function LessonPrefsStats() {
  const { stats, loading, error } = useLessonPrefsStats();

  if (loading) return <SkeletonLines widths={SKELETON_WIDTHS} />;
  if (error) return <p style={noteStyle}>{error}</p>;
  if (!stats) return null;
  return (
    <p style={noteStyle}>
      <RichText text={formatLessonPrefsStats(stats)} />
    </p>
  );
}
