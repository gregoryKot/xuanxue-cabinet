// «Записи занятий» — архив ученика (docs/PLAN.md §14, слой 3.3): критерий
// этапа — ученик находит запись прошлого занятия без вопроса в чат. Вход —
// карточка на LessonsScreen.tsx (SectionLink), не пункт меню (ADR-0025).
// Облик — тот же приём, что у MaterialsScreen.tsx: заголовок и объяснение
// шапкой (ScreenHeader), список одной карточкой (oneCardListStyle,
// docs/adr/0043), скелетон по форме будущего списка вместо спиннера.
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { oneCardListStyle } from '../components/listCardStyles';
import { screenSectionStyle } from '../components/screenLayout';
import { ScreenHeader } from '../components/ScreenHeader';
import { SkeletonList } from '../components/Skeleton';
import { ArchivedLessonCard } from './ArchivedLessonCard';
import { useMyArchive } from './useMyArchive';

const TITLE = 'Записи занятий';
const EXPLANATION = 'Занятия, которые уже прошли. Пропустили — посмотрите запись здесь.';
const EMPTY_MESSAGE = 'Прошедших занятий пока нет.';
// «Обновить» — та же подпись, что у соседнего экрана ученика
// (StudentLessonsScreen.tsx), не VOICE-умолчание LoadErrorBanner.
const RETRY_LABEL = 'Обновить';

export default function ArchiveScreen() {
  const { data: lessons, loading, error, reload } = useMyArchive();
  const ready = !loading && !error && lessons !== null;

  return (
    <section style={screenSectionStyle}>
      <ScreenHeader title={TITLE} explanation={EXPLANATION} />

      {error && (
        <LoadErrorBanner
          message={error}
          onRetry={() => void reload()}
          retryLabel={RETRY_LABEL}
        />
      )}

      {loading && !error && <SkeletonList rows={4} h={140} />}

      {ready && lessons.length === 0 && <p style={{ margin: 0 }}>{EMPTY_MESSAGE}</p>}

      {ready && lessons.length > 0 && (
        <ul style={oneCardListStyle}>
          {lessons.map((lesson, index) => (
            <ArchivedLessonCard
              key={lesson.id}
              lesson={lesson}
              isLast={index === lessons.length - 1}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
