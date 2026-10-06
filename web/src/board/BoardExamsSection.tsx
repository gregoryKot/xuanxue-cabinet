// Рубрика «Сдавать сейчас» на доске (ADR-0173): только то, что ждёт ученика,
// — `splitTasksToDo(...).toDo`, то же деление, что на «Заданиях». Карточка,
// старт и вопрос перед стартом — общие ExamTaskList.tsx и TaskStartDialog.tsx
// (вынесены из TasksScreen: вторая копия поймалась бы jscpd). Список —
// useMyExams из MyExamsProvider.tsx, тот же запрос, что у «Заданий» и колокольчика.
// Глубокая ссылка `?start=` (useStartFromLink) здесь не нужна: уведомление
// ведёт на «/tasks» (notificationTarget.ts), на доску такой адрес не приходит.
// Внизу — вход на «Задания» за тем, что уже на проверке и позади.
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { SectionLink } from '../components/SectionLink';
import { SkeletonList } from '../components/Skeleton';
import { ExamTaskList } from '../student/ExamTaskList';
import { useMyExams } from '../student/MyExamsProvider';
import { splitTasksToDo } from '../student/splitTasksToDo';
import { TaskStartDialog } from '../student/TaskStartDialog';
import { useTaskStart } from '../student/useTaskStart';
import { BoardSection } from './BoardSection';

const HEADING = 'Сдавать сейчас';
const EMPTY_MESSAGE = 'Экзаменов к сдаче нет.';
const ALL_TASKS_PATH = '/tasks';
const ALL_TASKS_TITLE = 'Все задания';
const ALL_TASKS_HINT = 'Что на проверке и что уже позади.';

export function BoardExamsSection() {
  const { data: exams, loading, error, reload } = useMyExams();
  const taskStart = useTaskStart();

  const ready = !loading && !error && exams !== null;
  const toDo = ready ? splitTasksToDo(exams).toDo : [];

  return (
    <BoardSection heading={HEADING}>
      {error && (
        <LoadErrorBanner
          message={error}
          onRetry={() => void reload()}
          retryLabel="Обновить"
        />
      )}

      {loading && !error && <SkeletonList rows={2} h={104} />}

      {ready && toDo.length === 0 && <p style={{ margin: 0 }}>{EMPTY_MESSAGE}</p>}
      {toDo.length > 0 && <ExamTaskList exams={toDo} taskStart={taskStart} />}

      <SectionLink to={ALL_TASKS_PATH} title={ALL_TASKS_TITLE} hint={ALL_TASKS_HINT} />
      <TaskStartDialog taskStart={taskStart} />
    </BoardSection>
  );
}
