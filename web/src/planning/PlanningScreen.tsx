// «Планирование» — календарь на 4 недели вперёд, построенный из расписания
// (docs/PLAN.md §6 п.3). Одно главное действие вверху — «Разовое занятие»
// (CLAUDE.md «Продукт»), рядом с объяснением.
import { useMemo, useState } from 'react';
import { PLANNING_HORIZON_WEEKS } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { screenExplanationStyle, screenSectionStyle } from '../components/screenLayout';
import { SkeletonList } from '../components/Skeleton';
import { useScrollToHash } from '../hooks/useScrollToHash';
import { useTeachers } from '../people/useTeachers';
import { useClasses } from '../schedule/useClasses';
import { groupLessonsByDay } from './groupLessonsByDay';
import { LessonDayGroup } from './LessonDayGroup';
import { LessonSheet } from './LessonSheet';
import { useLessons } from './useLessons';

const EXPLANATION = `Здесь занятия на ${PLANNING_HORIZON_WEEKS} недели вперёд, из расписания. Впишите тему заранее и добавьте запись после занятия — рассылка уйдёт сама.`;

export default function PlanningScreen() {
  const lessonsState = useLessons();
  const classesState = useClasses();
  // Учителя для select'а «Ведущий» — тот же приём, что classesState (аудит В4).
  const teachersState = useTeachers();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetLessonId, setSheetLessonId] = useState<string | null>(null);

  const classesById = useMemo(
    () => new Map((classesState.classes ?? []).map((cls) => [cls.id, cls])),
    [classesState.classes],
  );
  const groups = useMemo(
    () => groupLessonsByDay(lessonsState.lessons ?? []),
    [lessonsState.lessons],
  );
  const selectedLesson =
    lessonsState.lessons?.find((lesson) => lesson.id === sheetLessonId) ?? null;

  // Список занятий и его загрузка не зависят от `/classes`: ошибка или
  // задержка классов не должна прятать уже пришедшие занятия — карточки
  // показывают класс с фолбэком «—» (LessonDayGroup), а сбой классов идёт
  // отдельной строкой (ревью п.5).
  const lessonsError = lessonsState.error;
  const classesError = classesState.error;

  function retryLessons() {
    void lessonsState.reload();
  }

  function retryClasses() {
    void classesState.reload();
  }

  function openCreate() {
    setSheetLessonId(null);
    setSheetOpen(true);
  }

  function openLesson(lessonId: string) {
    setSheetLessonId(lessonId);
    setSheetOpen(true);
  }

  // Прокрутка/подсветка к `#lesson-{id}` — только когда список занятий
  // отрисован, иначе элемент ещё не в DOM.
  useScrollToHash(!lessonsState.loading && !lessonsError);

  return (
    <section style={screenSectionStyle}>
      <p style={screenExplanationStyle}>{EXPLANATION}</p>

      {!lessonsState.loading && <Button onClick={openCreate}>Разовое занятие</Button>}

      {lessonsError && <LoadErrorBanner message={lessonsError} onRetry={retryLessons} />}

      {lessonsState.loading && !lessonsError && <SkeletonList rows={5} h={56} />}

      {!lessonsState.loading && !lessonsError && groups.length === 0 && (
        <p style={{ margin: 0 }}>
          В ближайшие {PLANNING_HORIZON_WEEKS} недели занятий нет. Добавьте правило в
          «Расписании» или создайте разовое занятие.
        </p>
      )}

      {!lessonsState.loading &&
        !lessonsError &&
        groups.map((group) => (
          <LessonDayGroup
            key={group.key}
            group={group}
            classesById={classesById}
            onSelectLesson={openLesson}
          />
        ))}

      {/* Ошибка классов — отдельной строкой, не прячет уже загруженный
          список занятий (карточки показывают класс с фолбэком «—»). */}
      {!lessonsState.loading && classesError && (
        <LoadErrorBanner message={classesError} onRetry={retryClasses} />
      )}

      {sheetOpen && (
        <LessonSheet
          lessonDto={selectedLesson}
          classes={classesState.classes ?? []}
          teachers={teachersState.teachers ?? []}
          teachersError={teachersState.error}
          onRetryTeachers={() => void teachersState.reload()}
          onClose={() => setSheetOpen(false)}
          onCreate={lessonsState.create}
          onUpdate={lessonsState.update}
          onAddRecording={lessonsState.addRecording}
          onSendNow={lessonsState.sendNow}
        />
      )}
    </section>
  );
}
