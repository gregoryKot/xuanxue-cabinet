// Карточка «Новое задание» в центре уведомлений (ADR-0065) — форма, к которой
// ученик ещё не приступал: тот же признак (getExamAction(exam) === 'start'),
// что уже решает рубрику «Новое» на TasksScreen.tsx (useNotificationsData.ts).
// Своего вида уведомления под неё не заводили, и флага «прочитано» у неё нет:
// карточка не запись в ленте, а вычисленное состояние — она гаснет сама, как
// только ученик начнёт попытку.
//
// Карточка ведёт на «Задания», а не начинает попытку прямо здесь: старт живёт
// на TasksScreen.tsx (useMyExams.startAttempt), и вторая реализация того же
// действия тут стала бы второй реализацией одного ввода — CLAUDE.md «Одна
// механика — один компонент».
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { MyExamDto } from '@xuanxue/shared';

const RUBRIC = 'Новое задание';
const TASKS_PATH = '/tasks';

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
  return (
    <li>
      <Link to={TASKS_PATH} style={cardStyle}>
        <span style={rubricStyle}>{RUBRIC}</span>
        <span style={titleStyle}>{exam.title}</span>
      </Link>
    </li>
  );
}
