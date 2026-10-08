// Плитка «Сдать экзамен» на главной (ADR-0178, раньше рубрика «Сдавать сейчас»
// ADR-0173): только то, что ждёт ученика, — `splitTasksToDo(...).toDo`, то же
// деление, что на «Заданиях». Карточка, старт и вопрос перед стартом — общие
// ExamTaskList.tsx и TaskStartDialog.tsx. Нечего сдавать — плитки нет вовсе
// (решает studentHomeView.ts): человек, который пришёл за расписанием, про
// экзамены не читает ни слова. Внутри плитки вход «Все задания» за тем, что
// уже на проверке и позади.
// Глубокая ссылка `?start=` (useStartFromLink) здесь не нужна: уведомление
// ведёт на «/tasks» (notificationTarget.ts), на главную такой адрес не приходит.
import type { MyExamDto } from '@xuanxue/shared';
import { ExamTaskList } from '../student/ExamTaskList';
import { TaskStartDialog } from '../student/TaskStartDialog';
import { useTaskStart } from '../student/useTaskStart';
import { BoardTile } from './BoardTile';

const TITLE = 'Сдать экзамен';
const ALL_TASKS_MORE = { to: '/tasks', label: 'Все задания' };

interface BoardExamsTileProps {
  exams: MyExamDto[];
}

export function BoardExamsTile({ exams }: BoardExamsTileProps) {
  const taskStart = useTaskStart();

  return (
    <BoardTile title={TITLE} more={ALL_TASKS_MORE}>
      <ExamTaskList exams={exams} taskStart={taskStart} />
      <TaskStartDialog taskStart={taskStart} />
    </BoardTile>
  );
}
