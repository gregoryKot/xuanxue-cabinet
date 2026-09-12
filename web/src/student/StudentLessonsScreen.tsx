// Первый настоящий экран ученика (docs/PLAN.md §11, слой 4.1; ТЗ
// student-screen.md) — ближайшие занятия школы. Раньше StudentScreen.tsx был
// заглушкой с объяснением и ссылкой на сайт; сама ссылка осталась в нём же,
// ниже этого списка (CLAUDE.md «Ноль нагрузки на ученика»: занятия — то,
// ради чего ученик сюда зашёл, сайт школы — не вместо них).
// Экзаменов, «что задано» и результатов здесь нет — они появятся вместе со
// своими слоями (4.2–4.6), пустой раздел под них хуже отсутствующего.
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { screenExplanationStyle, screenSectionStyle } from '../components/screenLayout';
import { SkeletonList } from '../components/Skeleton';
import { StudentLessonCard } from './StudentLessonCard';
import { useMyLessons } from './useMyLessons';

const EXPLANATION =
  'Здесь — ближайшие занятия школы: когда они начинаются по вашим часам и как на них попасть.';
const EMPTY_MESSAGE = 'Ближайших занятий пока нет.';
const listStyle = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 10,
};

export function StudentLessonsScreen() {
  const { data: lessons, loading, error, reload } = useMyLessons();

  return (
    <section style={screenSectionStyle}>
      <p style={screenExplanationStyle}>{EXPLANATION}</p>

      {error && (
        <LoadErrorBanner
          message={error}
          onRetry={() => void reload()}
          retryLabel="Обновить"
        />
      )}

      {loading && !error && <SkeletonList rows={3} h={104} />}

      {!loading && !error && lessons && lessons.length === 0 && (
        <p style={{ margin: 0 }}>{EMPTY_MESSAGE}</p>
      )}

      {!loading && !error && lessons && lessons.length > 0 && (
        <ul style={listStyle}>
          {lessons.map((lesson) => (
            <StudentLessonCard key={lesson.id} lesson={lesson} />
          ))}
        </ul>
      )}
    </section>
  );
}
