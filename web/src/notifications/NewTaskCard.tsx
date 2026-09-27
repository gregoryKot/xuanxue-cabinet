// Карточка «Новое задание» в центре уведомлений (ADR-0063) — форма, к которой
// ученик ещё не приступал: тот же признак (getMyExamAction(exam) === 'start',
// shared/src/my-exams.ts), что уже решает рубрику «Новое» на TasksScreen.tsx
// (useNotificationsData.ts).
// Своего вида уведомления под неё не заводили — карточка не запись в ленте, а
// вычисленное состояние. Флаг «прочитано» у неё всё-таки есть с ADR-0129
// (отзыв тестировщицы 2026-09-23): нажатие само по себе ставит серверную
// отметку `MyExamsProvider.markSeen()`, поэтому карточка гаснет из счётчика
// сразу, а не только когда ученик реально начнёт попытку.
//
// Ссылка ведёт на «Задания» с параметром `?start=<examId>` (ADR-0129), не
// начинает попытку прямо здесь: сам старт («Вы начинаете экзамен» — тот же
// диалог, что у кнопки «Начать») живёт на TasksScreen.tsx через
// useStartFromLink.ts — вторая реализация того же действия тут стала бы
// второй реализацией одного ввода (CLAUDE.md «Одна механика — один
// компонент»).
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { MyExamDto } from '@xuanxue/shared';
import { useMyExams } from '../student/MyExamsProvider';

const RUBRIC = 'Новое задание';
const TASKS_PATH = '/tasks';

function taskLinkPath(examId: string): string {
  return `${TASKS_PATH}?start=${encodeURIComponent(examId)}`;
}

// Облик — тёплая плашка, как у StudentExamCard.tsx (student/StudentExamCard.tsx).
const cardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: '18px 20px',
  borderRadius: 'var(--radius-block)',
  background: 'var(--panel-warm)',
  textDecoration: 'none',
  color: 'var(--ink)',
  minHeight: 44,
};
// #55584e, не --ink-soft: тот же прецедент, что у StudentExamCard.tsx — на
// --panel-warm --ink-soft держит только ~4.06:1, ниже AA 4.5 для этого кегля.
const rubricStyle: CSSProperties = {
  fontSize: 12,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: '#55584e',
};
const titleStyle: CSSProperties = { fontFamily: 'var(--font-display)', fontSize: 22 };

export function NewTaskCard({ exam }: { exam: MyExamDto }) {
  const { markSeen } = useMyExams();
  return (
    <li>
      <Link
        to={taskLinkPath(exam.id)}
        style={cardStyle}
        onClick={() => markSeen(exam.id)}
      >
        <span style={rubricStyle}>{RUBRIC}</span>
        <span style={titleStyle}>{exam.title}</span>
      </Link>
    </li>
  );
}
