// Рубрика «Ближайшее занятие» на доске (ADR-0173): первое занятие из
// GET /me/lessons крупной карточкой (StudentNextLesson.tsx) и вход на
// «Занятия» за остальными. `/me/lessons` отдаёт список по возрастанию
// startsAt (MyLessonsService), поэтому ближайшее — первое, без пересортировки.
// Нет занятий — честная фраза, а не пустое место.
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { SectionLink } from '../components/SectionLink';
import { SkeletonList } from '../components/Skeleton';
import { StudentNextLesson } from '../student/StudentNextLesson';
import { useMyLessons } from '../student/useMyLessons';
import { BoardSection } from './BoardSection';

const HEADING = 'Ближайшее занятие';
const EMPTY_MESSAGE = 'Ближайших занятий пока нет.';
const LESSONS_PATH = '/lessons';
const LESSONS_TITLE = 'Все занятия';
const LESSONS_HINT = 'Расписание, записи и библиотека.';

export function BoardNextLesson() {
  const { data: lessons, loading, error, reload } = useMyLessons();
  const ready = !loading && !error && lessons !== null;
  const nextLesson = ready ? lessons[0] : undefined;

  return (
    <BoardSection heading={HEADING}>
      {error && (
        <LoadErrorBanner
          message={error}
          onRetry={() => void reload()}
          retryLabel="Обновить"
        />
      )}

      {loading && !error && <SkeletonList rows={1} h={148} />}

      {ready && !nextLesson && <p style={{ margin: 0 }}>{EMPTY_MESSAGE}</p>}
      {nextLesson && <StudentNextLesson lesson={nextLesson} />}

      <SectionLink to={LESSONS_PATH} title={LESSONS_TITLE} hint={LESSONS_HINT} />
    </BoardSection>
  );
}
