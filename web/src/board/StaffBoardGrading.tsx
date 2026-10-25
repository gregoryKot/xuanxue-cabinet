// Плитка «Проверка» на главной штата: число работ в очереди кликабельной
// строкой (тот же приём, что на «Экзаменах»: exams/ExamsSectionStats.tsx,
// gradingQueueHint.ts). Вынесена из StaffBoard.tsx, чтобы скрытая человеком
// плитка (ADR-0179) не монтировалась и не просила очередь у сервера.
import { SectionLink } from '../components/SectionLink';
import { formatGradingQueueHint } from '../grading/gradingQueueHint';
import { useGradingQueue } from '../grading/useGradingQueue';
import { BoardLoadError } from './BoardLoadError';

const GRADING_PATH = '/grading';
const GRADING_TITLE = 'Проверка';
const GRADING_HINT = 'Сданные работы учеников, которые ждут вашей оценки.';

export function StaffBoardGrading() {
  const { attempts, error, reload } = useGradingQueue();

  return (
    <>
      {error && <BoardLoadError message={error} onRetry={() => void reload()} />}
      <SectionLink
        to={GRADING_PATH}
        title={GRADING_TITLE}
        headline={formatGradingQueueHint(attempts?.length ?? null)}
        hint={GRADING_HINT}
      />
    </>
  );
}
