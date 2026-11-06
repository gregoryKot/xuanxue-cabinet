// Страница «Тема недели» — `/planning/week-topic/:weekKey` (ADR-0197): одна
// тема в несколько занятий недели. Неделя — по ключу в адресе (воскресенье,
// пояс зрителя, weekTopic.ts). Форма собирается только после загрузки
// занятий: начальные галочки считаются один раз (useWeekTopic.ts).
import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { LoadedPage } from '../components/LoadedPage';
import { screenSectionStyle } from '../components/screenLayout';
import { ScreenHeader } from '../components/ScreenHeader';
import { useClasses } from '../schedule/useClasses';
import { useLessons } from './useLessons';
import { WeekTopicForm } from './WeekTopicForm';
import { weekHeadingOfKey, weekKeyOf } from './weekTopic';

const TITLE = 'Тема недели';
const EXPLANATION =
  'Тема запишется в **отмеченные занятия** и попадёт в пост со ссылкой. Пост, который уже ушёл, не меняется.';

export default function WeekTopicScreen() {
  const { weekKey = '' } = useParams<{ weekKey: string }>();
  const lessonsState = useLessons();
  const classesState = useClasses();

  const weekLessons = useMemo(
    () => (lessonsState.lessons ?? []).filter((l) => weekKeyOf(l.startsAt) === weekKey),
    [lessonsState.lessons, weekKey],
  );
  const classesById = useMemo(
    () => new Map((classesState.classes ?? []).map((cls) => [cls.id, cls])),
    [classesState.classes],
  );

  return (
    <LoadedPage
      loading={lessonsState.loading || classesState.loading}
      error={lessonsState.error}
      onRetry={() => void lessonsState.reload()}
      skeletonWidths={['40%', '90%', '70%']}
    >
      {() => (
        <section style={screenSectionStyle}>
          <ScreenHeader
            title={TITLE}
            explanation={EXPLANATION}
            hint={weekHeadingOfKey(weekKey)}
          />
          <WeekTopicForm lessons={weekLessons} classesById={classesById} />
        </section>
      )}
    </LoadedPage>
  );
}
