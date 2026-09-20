// «Занятия» — первый экран после входа (docs/PLAN.md §6, `/` → `/planning`):
// сверху что идёт сегодня (PlanningToday.tsx), ниже календарь на 4 недели.
// Вход в сетку расписания — тихая кнопка в шапке рядом с «Разовым занятием»
// (PlanningActions.tsx), не пункт меню (docs/adr/0025-navigation-by-domain.md,
// дополнение 2026-09-18): расписание раньше было карточкой внизу списка, и на
// телефоне до неё было не долистать (отзыв владельца). Материалы — свой
// раздел меню (ADR-0055), из этой шапки в них больше не ходят.
// Облик — направление «Тёплая школа» (docs/adr/0043, макет 1c-planning.html):
// заголовок антиквой, строка объяснения, день — карточка со строками занятий.
// Правка и создание занятия — своя страница `/planning/new` и
// `/planning/:lessonId` (LessonEditorScreen.tsx, ADR-0033): отсюда только
// переход.
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatRecordingSummary, PLANNING_HORIZON_WEEKS } from '@xuanxue/shared';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { screenHintStyle, screenSectionStyle } from '../components/screenLayout';
import { ScreenHeader } from '../components/ScreenHeader';
import { SkeletonList } from '../components/Skeleton';
import { useScrollToHash } from '../hooks/useScrollToHash';
import { planningTzNote } from '../schedule/timezoneLabel';
import { useClasses } from '../schedule/useClasses';
import { groupLessonsByDay } from './groupLessonsByDay';
import { LessonDayGroup } from './LessonDayGroup';
import { PlanningActions } from './PlanningActions';
import { PlanningToday } from './PlanningToday';
import { useLessons } from './useLessons';
import { useLessonRecordingSummary } from './useLessonRecordingSummary';

const TITLE = 'Занятия';
const EXPLANATION = `Занятия на ${PLANNING_HORIZON_WEEKS} недели вперёд. Дни, время и ссылки Zoom — в «Расписании». Впишите тему заранее и добавьте запись после занятия — рассылка уйдёт сама.`;
// Блок текста шапки уже макета (1c-planning.html, docs/adr/0043) — рядом
// теперь пара действий, «Расписание» и «Разовое занятие»
// (PlanningActions.tsx, отзыв владельца 2026-09-18): на 880px общей ширины
// экрана столбец текста 620 (значение ScreenHeader по умолчанию) сталкивал бы
// их на вторую строку раньше, чем нужно — у 540 для пары действий ещё
// остаётся запас.
const TITLE_MAX_WIDTH_PX = 540;
// Кнопка называется «Разовое занятие», и по названию непонятно, чем оно
// отличается от строчки расписания (отзыв владельца 2026-09-12).
const ONE_OFF_HINT =
  'Разовое занятие — то, чего нет в расписании: семинар, перенос, замена. Расписание от него не меняется.';
const oneOffHintStyle = { ...screenHintStyle, margin: 0 };
// Число раздела (ТЗ §14, слой 3.5) — тихая строка, не StatNumber: крупный
// кегль спорил бы вниманием с блоком «сегодня» (решение агента).
const recordingLineStyle = { ...screenHintStyle, margin: 0 };
const LESSON_PATH = '/planning';
const SCHEDULE_PATH = '/schedule';

export default function PlanningScreen() {
  const lessonsState = useLessons();
  const classesState = useClasses();
  const recordingSummary = useLessonRecordingSummary();
  const navigate = useNavigate();

  // Сбой числа не должен ломать экран баннером — хук молчит про ошибку.
  const recordingLine = recordingSummary
    ? formatRecordingSummary(recordingSummary)
    : null;

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
  const openSchedule = () => void navigate(SCHEDULE_PATH);
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
            <PlanningActions onOpenSchedule={openSchedule} onCreateOneOff={openCreate} />
          )
        }
      />
      {!lessonsState.loading && <p style={oneOffHintStyle}>{ONE_OFF_HINT}</p>}
      {recordingLine && <p style={recordingLineStyle}>{recordingLine}</p>}
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
    </section>
  );
}
