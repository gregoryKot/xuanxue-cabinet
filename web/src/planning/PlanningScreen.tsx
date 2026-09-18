// «Занятия» — первый экран после входа (docs/PLAN.md §6, `/` → `/planning`):
// сверху что идёт сегодня (PlanningToday.tsx), ниже календарь на 4 недели.
// Вход в сетку расписания — текстовой ссылкой внизу, не пунктом меню
// (docs/adr/0025-navigation-by-domain.md).
// Облик — направление «тихо и благородно» (docs/adr/0031), макет
// Schedule.dc.html: заголовок антиквой, строка объяснения, занятия строками.
// Правка и создание занятия — своя страница `/planning/new` и
// `/planning/:lessonId` (LessonEditorScreen.tsx, ADR-0033): отсюда только
// переход.
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PLANNING_HORIZON_WEEKS } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import {
  primaryActionStyle,
  screenHintStyle,
  screenSectionStyle,
} from '../components/screenLayout';
import { ScreenHeader } from '../components/ScreenHeader';
import { SkeletonList } from '../components/Skeleton';
import { useScrollToHash } from '../hooks/useScrollToHash';
import { planningTzNote } from '../schedule/timezoneLabel';
import { useClasses } from '../schedule/useClasses';
import { groupLessonsByDay } from './groupLessonsByDay';
import { LessonDayGroup } from './LessonDayGroup';
import { PlanningToday } from './PlanningToday';
import { ScheduleLink } from './ScheduleLink';
import { useLessons } from './useLessons';

const TITLE = 'Занятия';
const EXPLANATION = `Занятия на ${PLANNING_HORIZON_WEEKS} недели вперёд, из расписания. Впишите тему заранее и добавьте запись после занятия — рассылка уйдёт сама.`;
// Блок текста шапки уже макета (1c-planning.html, docs/adr/0043) — рядом
// всегда крупная кнопка «Разовое занятие», и на 880px общей ширины экрана
// столбец текста 620 (значение ScreenHeader по умолчанию) сталкивал бы её на
// вторую строку раньше, чем нужно.
const TITLE_MAX_WIDTH_PX = 540;
// Кнопка называется «Разовое занятие», и по названию непонятно, чем оно
// отличается от строчки расписания (отзыв владельца 2026-09-12).
const ONE_OFF_HINT =
  'Разовое занятие — то, чего нет в расписании: семинар, перенос, замена. Расписание от него не меняется.';
const oneOffHintStyle = { ...screenHintStyle, margin: 0 };
const LESSON_PATH = '/planning';

export default function PlanningScreen() {
  const lessonsState = useLessons();
  const classesState = useClasses();
  const navigate = useNavigate();

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
  // Список занятий не зависит от `/classes` (пояснение — у баннера ниже).
  const lessonsError = lessonsState.error;
  const classesError = classesState.error;

  const retryLessons = () => void lessonsState.reload();
  const retryClasses = () => void classesState.reload();
  // Занятие открывается своей страницей с адресом, а не листом поверх списка
  // (ADR-0033): ссылку можно прислать, «Назад» браузера возвращает сюда.
  const openCreate = () => void navigate(`${LESSON_PATH}/new`);
  const openLesson = (lessonId: string) => void navigate(`${LESSON_PATH}/${lessonId}`);

  // Прокрутка к `#lesson-{id}` — на случай внешней ссылки (бот, уведомление).
  useScrollToHash(!lessonsState.loading && !lessonsError);

  return (
    <section style={screenSectionStyle}>
      <ScreenHeader
        title={TITLE}
        explanation={EXPLANATION}
        hint={tzNote}
        titleMaxWidth={TITLE_MAX_WIDTH_PX}
        action={
          !lessonsState.loading && (
            <Button style={primaryActionStyle} onClick={openCreate}>
              Разовое занятие
            </Button>
          )
        }
      />
      {!lessonsState.loading && <p style={oneOffHintStyle}>{ONE_OFF_HINT}</p>}
      {/* Сбой списка занятий — один баннер ниже, не два (TodaySection.tsx). */}
      {!lessonsError && (
        <PlanningToday
          lessons={lessonsState.lessons}
          classTitleById={classTitleById}
          onOpenLesson={openLesson}
        />
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
      <ScheduleLink />
    </section>
  );
}
