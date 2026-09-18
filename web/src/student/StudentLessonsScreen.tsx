// Занятия на экране ученика (docs/PLAN.md §11, слой 4.1; ТЗ
// student-screen.md). Ближайшее — крупно и первым (StudentNextLesson.tsx,
// макет Student.dc.html): ученик открывает кабинет, чтобы узнать, когда
// занятие и как на него попасть. Следующие за ним идут строками ниже под
// меткой «Дальше» — их читают вторым взглядом.
//
// Колонку и заголовок раздела даёт app/StudentScreen.tsx: экзамены ниже
// стоят в той же колонке, и своя рамка здесь развела бы их по разным полям.
// `/me/lessons` отдаёт список уже по возрастанию startsAt (сортировка в
// MyLessonsService), поэтому ближайшее — первое, без пересортировки здесь.
import type { CSSProperties } from 'react';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { oneCardListStyle } from '../components/listCardStyles';
import { SkeletonList } from '../components/Skeleton';
import { StudentLessonCard } from './StudentLessonCard';
import { StudentNextLesson } from './StudentNextLesson';
import { useMyLessons } from './useMyLessons';

const EMPTY_MESSAGE = 'Ближайших занятий пока нет.';
const LATER_HEADING = 'Дальше';

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
};
const laterStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };
// У `<h2>` свои отступы от браузера, а метка-рубрика стоит вплотную к
// списку — расстояние держит `gap` колонки.
const eyebrowHeadingStyle: CSSProperties = { margin: 0 };

export function StudentLessonsScreen() {
  const { data: lessons, loading, error, reload } = useMyLessons();
  const ready = !loading && !error && lessons !== null;
  const [nextLesson, ...laterLessons] = ready ? lessons : [];

  return (
    <section style={sectionStyle}>
      {error && (
        <LoadErrorBanner
          message={error}
          onRetry={() => void reload()}
          retryLabel="Обновить"
        />
      )}

      {loading && !error && <SkeletonList rows={3} h={104} />}

      {ready && lessons.length === 0 && <p style={{ margin: 0 }}>{EMPTY_MESSAGE}</p>}

      {nextLesson && <StudentNextLesson lesson={nextLesson} />}

      {laterLessons.length > 0 && (
        <div style={laterStyle}>
          <h2 className="xuanxue-eyebrow" style={eyebrowHeadingStyle}>
            {LATER_HEADING}
          </h2>
          <ul style={oneCardListStyle}>
            {laterLessons.map((lesson, index) => (
              <StudentLessonCard
                key={lesson.id}
                lesson={lesson}
                isLast={index === laterLessons.length - 1}
              />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
