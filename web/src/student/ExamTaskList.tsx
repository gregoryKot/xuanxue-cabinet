// Список карточек заданий со стартом — общий кусок экранов «Задания»
// (TasksScreen.tsx) и «Доска» (board/BoardExamsSection.tsx, ADR-0173). Вынесен
// из TasksScreen, чтобы вторая копия «карточка + ошибка старта + кнопка» не
// выросла на доске (CLAUDE.md «Одна механика — один компонент», jscpd).
// Сам старт — useTaskStart.ts: экран зовёт хук один раз и отдаёт результат
// сюда и в TaskStartDialog.tsx, потому что диалог и карточки делят состояние.
import type { MyExamDto } from '@xuanxue/shared';
import { cardListStyle } from '../components/listCardStyles';
import { StudentExamCard } from './StudentExamCard';
import type { UseTaskStartResult } from './useTaskStart';

interface ExamTaskListProps {
  exams: MyExamDto[];
  taskStart: UseTaskStartResult;
}

export function ExamTaskList({ exams, taskStart }: ExamTaskListProps) {
  const { pendingExamId, errors, start } = taskStart;
  return (
    <ul style={cardListStyle}>
      {exams.map((exam) => (
        <StudentExamCard
          key={exam.id}
          exam={exam}
          pending={pendingExamId === exam.id}
          error={errors[exam.id] || null}
          onStart={() => start(exam)}
        />
      ))}
    </ul>
  );
}
