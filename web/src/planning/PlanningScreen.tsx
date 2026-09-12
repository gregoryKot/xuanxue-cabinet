// «Занятия» — первый экран после входа (docs/PLAN.md §6, `/` → `/planning`):
// сверху что идёт сегодня (PlanningToday.tsx), ниже календарь на 4 недели.
// Вход в сетку расписания — карточкой внизу (SectionLink), не пунктом меню
// (docs/adr/0025-navigation-by-domain.md).
import { useMemo, useState } from 'react';
import { PLANNING_HORIZON_WEEKS } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import {
  primaryActionStyle,
  screenExplanationStyle,
  screenHintStyle,
  screenSectionStyle,
} from '../components/screenLayout';
import { SectionLink } from '../components/SectionLink';
import { SkeletonList } from '../components/Skeleton';
import { useScrollToHash } from '../hooks/useScrollToHash';
import { useTeachers } from '../people/useTeachers';
import { ScheduleIcon } from '../app/navIcons';
import { planningTzNote } from '../schedule/timezoneLabel';
import { useClasses } from '../schedule/useClasses';
import { groupLessonsByDay } from './groupLessonsByDay';
import { LessonDayGroup } from './LessonDayGroup';
import { LessonSheet } from './LessonSheet';
import { PlanningToday } from './PlanningToday';
import { useLessons } from './useLessons';

const EXPLANATION = `Здесь занятия на ${PLANNING_HORIZON_WEEKS} недели вперёд, из расписания. Впишите тему заранее и добавьте запись после занятия — рассылка уйдёт сама.`;
// Кнопка называется «Разовое занятие», и по названию непонятно, чем оно
// отличается от строчки расписания (отзыв владельца 2026-09-12).
const ONE_OFF_HINT =
  'Разовое занятие — то, чего нет в расписании: семинар, перенос, замена. Расписание от него не меняется.';
const SCHEDULE_LINK_HINT =
  'Дни, время, ссылки Zoom, ведущие. Из них рождаются занятия здесь.';

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
  const classTitleById = useMemo(
    () => new Map([...classesById].map(([id, cls]) => [id, cls.title])),
    [classesById],
  );
  const groups = useMemo(
    () => groupLessonsByDay(lessonsState.lessons ?? []),
    [lessonsState.lessons],
  );
  // Без подписи время читается как время школы — приписка у каждой строки
  // была частоколом (отзыв владельца 2026-09-12).
  const tzNote = useMemo(
    () => planningTzNote((classesState.classes ?? []).map((cls) => cls.tz)),
    [classesState.classes],
  );
  const selectedLesson =
    lessonsState.lessons?.find((lesson) => lesson.id === sheetLessonId) ?? null;

  // Список занятий не зависит от `/classes` (пояснение — у баннера ниже).
  const lessonsError = lessonsState.error;
  const classesError = classesState.error;

  const retryLessons = () => void lessonsState.reload();
  const retryClasses = () => void classesState.reload();
  const openCreate = () => {
    setSheetLessonId(null);
    setSheetOpen(true);
  };
  const openLesson = (lessonId: string) => {
    setSheetLessonId(lessonId);
    setSheetOpen(true);
  };

  // Прокрутка к `#lesson-{id}` — на случай внешней ссылки (бот, уведомление).
  useScrollToHash(!lessonsState.loading && !lessonsError);

  return (
    <section style={screenSectionStyle}>
      <p style={screenExplanationStyle}>{EXPLANATION}</p>
      {tzNote && <p style={screenHintStyle}>{tzNote}</p>}
      {/* Сбой списка занятий — один баннер ниже, не два (TodaySection.tsx). */}
      {!lessonsError && (
        <PlanningToday
          lessons={lessonsState.lessons}
          classTitleById={classTitleById}
          onOpenLesson={openLesson}
        />
      )}
      {!lessonsState.loading && (
        <div>
          <Button style={primaryActionStyle} onClick={openCreate}>
            Разовое занятие
          </Button>
          <p style={{ ...screenHintStyle, margin: '6px 0 0' }}>{ONE_OFF_HINT}</p>
        </div>
      )}
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
      <SectionLink
        to="/schedule"
        title="Сетка расписания"
        hint={SCHEDULE_LINK_HINT}
        Icon={ScheduleIcon}
      />
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
