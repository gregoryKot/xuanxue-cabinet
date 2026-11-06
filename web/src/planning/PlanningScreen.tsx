// Главный экран раздела «Расписание», `/schedule` (ADR-0198). Был «Занятия»
// на `/planning`; имя файла осталось, как `BoardScreen` у «Главной»
// (ADR-0178). Сверху что идёт сегодня (PlanningToday.tsx), ниже календарь на
// 4 недели с темой недели. Правила недели, журнал отправок — тихие кнопки в
// шапке (components/ScreenActions.tsx, docs/adr/0025): карточку внизу списка
// на телефоне было не долистать. Облик — «Тёплая школа» (docs/adr/0043).
// Правка и создание занятия — своя страница `/planning/new` и
// `/planning/:lessonId` (LessonEditorScreen.tsx, ADR-0033): отсюда только
// переход.
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatRecordingSummary, PLANNING_HORIZON_WEEKS } from '@xuanxue/shared';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { RichText } from '../components/RichText';
import { ScreenActions, type ScreenAction } from '../components/ScreenActions';
import { screenHintStyle, screenSectionStyle } from '../components/screenLayout';
import { ScreenHeader } from '../components/ScreenHeader';
import { SkeletonList } from '../components/Skeleton';
import { useScrollToHash } from '../hooks/useScrollToHash';
import { planningTzNote } from '../schedule/timezoneLabel';
import { useClasses } from '../schedule/useClasses';
import { LessonWeekGroup } from './LessonWeekGroup';
import { PlanningToday } from './PlanningToday';
import { RulesDeliveryNotice } from './RulesDeliveryNotice';
import { upcomingDayGroups } from './upcomingDayGroups';
import { useLessons } from './useLessons';
import { groupDayGroupsByWeek } from './weekTopic';
import { useLessonRecordingSummary } from './useLessonRecordingSummary';

const TITLE = 'Расписание';
const EXPLANATION = `Занятия на **${PLANNING_HORIZON_WEEKS} недели** вперёд. Впишите тему заранее и добавьте запись после занятия — рассылка уйдёт сама.`;
// Блок текста шапки уже макета (1c-planning.html, docs/adr/0043): рядом пара
// действий, и на 880px столбец 620 (по умолчанию) сталкивал бы их на вторую
// строку раньше нужного — у 540 запас остаётся (отзыв владельца 2026-09-18).
const TITLE_MAX_WIDTH_PX = 540;
// По названию кнопки непонятно, чем разовое занятие отличается от правила
// недели (отзыв владельца 2026-09-12).
const ONE_OFF_HINT =
  'Разовое занятие — то, чего нет в правилах недели: семинар, перенос, замена. Правила от него **не меняются**.';
// Тихие строки шапки — приписка к кнопке и число раздела (ТЗ §14, слой 3.5;
// строкой, не StatNumber: крупный кегль спорил бы с блоком «сегодня»). Мера
// как у текста шапки, иначе строка тянется на все 880 и спорит с колонкой
// 540. Отступ отрицательный: на общем зазоре секции (16) заголовок и две
// тихие строки читались тремя равными серыми абзацами (отзыв 2026-09-21).
const headerNoteStyle = {
  ...screenHintStyle,
  margin: '-8px 0 0',
  maxWidth: TITLE_MAX_WIDTH_PX,
};
const LESSON_PATH = '/planning';
const RULES_PATH = '/schedule/rules';
const JOURNAL_PATH = '/broadcasts';
const EMPTY_GROUPS_MESSAGE =
  'Пока ничего не запланировано. Добавьте занятие в «Правила недели» или создайте **разовое занятие**.';

export default function PlanningScreen() {
  const lessonsState = useLessons();
  const classesState = useClasses();
  const recordingSummary = useLessonRecordingSummary();
  const navigate = useNavigate();

  const recordingLine = recordingSummary
    ? formatRecordingSummary(recordingSummary)
    : null;

  const classesById = useMemo(
    () => new Map((classesState.classes ?? []).map((cls) => [cls.id, cls])),
    [classesState.classes],
  );
  const weeks = useMemo(
    () => groupDayGroupsByWeek(upcomingDayGroups(lessonsState.lessons ?? [])),
    [lessonsState.lessons],
  );
  // Приписка пояса — одна на экран, не у каждой строки (отзыв 2026-09-12).
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
  const openRules = () => void navigate(RULES_PATH);
  const openLesson = (lessonId: string) => void navigate(`${LESSON_PATH}/${lessonId}`);

  const actions: ScreenAction[] = [
    { label: 'Правила недели', onClick: openRules },
    { label: 'Журнал отправок', onClick: () => void navigate(JOURNAL_PATH) },
  ];
  if (!lessonsState.loading) {
    actions.push({ label: 'Разовое занятие', onClick: openCreate, variant: 'primary' });
  }

  // Прокрутка к `#lesson-{id}` — на случай внешней ссылки (бот, уведомление).
  useScrollToHash(!lessonsState.loading && !lessonsError);

  return (
    <section style={screenSectionStyle}>
      <ScreenHeader
        title={TITLE}
        explanation={EXPLANATION}
        hint={tzNote}
        titleMaxWidth={TITLE_MAX_WIDTH_PX}
        action={<ScreenActions actions={actions} />}
      />
      {!lessonsState.loading && (
        <p style={headerNoteStyle}>
          <RichText text={ONE_OFF_HINT} />
        </p>
      )}
      {recordingLine && <p style={headerNoteStyle}>{recordingLine}</p>}
      <RulesDeliveryNotice classes={classesState.classes} onOpenRules={openRules} />
      {/* Сбой списка занятий — один баннер ниже, не два (TodaySection.tsx). */}
      {!lessonsError && (
        <PlanningToday
          lessons={lessonsState.lessons}
          classesById={classesById}
          onOpenLesson={openLesson}
        />
      )}
      {lessonsError && <LoadErrorBanner message={lessonsError} onRetry={retryLessons} />}
      {lessonsState.loading && !lessonsError && <SkeletonList rows={5} h={56} />}

      {!lessonsState.loading && !lessonsError && weeks.length === 0 && (
        <p style={{ margin: 0 }}>
          <RichText text={EMPTY_GROUPS_MESSAGE} />
        </p>
      )}

      {!lessonsState.loading &&
        !lessonsError &&
        weeks.map((week) => (
          <LessonWeekGroup
            key={week.key}
            week={week}
            classesById={classesById}
            onSelectLesson={openLesson}
          />
        ))}
      {/* Ошибка классов не прячет список занятий (класс — с фолбэком «—»). */}
      {!lessonsState.loading && classesError && (
        <LoadErrorBanner message={classesError} onRetry={retryClasses} />
      )}
    </section>
  );
}
