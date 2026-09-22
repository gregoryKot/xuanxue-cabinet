// Карточка одного экзамена на экране ученика (ТЗ п.1, результат — ТЗ слоя
// 4.7): название, что с экзаменом происходит сейчас, одна кнопка по смыслу —
// а если работу уже проверили, ещё и итог с комментарием учителя. Облик —
// тёплая плашка `--panel-warm` (макет 1c-planning.html, docs/adr/0043), тот
// же приём, что у «Ждут отправки вручную» (broadcasts/ManualDeliveriesSection.tsx)
// и сводки экзаменов (exams/ExamsSectionStats.tsx). Кнопка остаётся вторичной
// (`variant="secondary"`), хотя макет рисует её залитой: заливка терракотой
// уже занята «Подключиться» у ближайшего занятия выше на этом же экране
// (StudentLessonMeeting.tsx) — правило «один акцент на экран» (ADR-0043) не
// делает исключения для второй кнопки того же цвета. Итог вынесен в
// ExamAttemptOutcome — своя логика, что показывать, не должна раздувать саму
// карточку (CLAUDE.md «Храповики», лимит 150 строк).
//
// Порядок строк — по времени, и это отзыв владельца 2026-09-22 (ADR-0120):
// сначала настоящее (состояние или итог проверки), потом будущее — остаток
// попыток у самой кнопки. Раньше «Осталось 6 попыток» стояло первой строкой
// над «Отправлено, ждём проверки», и было непонятно, при чём тут попытки,
// если работа уже у учителя.
import type { CSSProperties } from 'react';
import { getMyExamAction, type MyExamDto } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { ExamAttemptOutcome } from './ExamAttemptOutcome';
import { describeExamState, formatAttemptsLeft } from './examAttemptState';

const RUBRIC = 'Экзамен';

const cardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: '18px 20px',
  borderRadius: 'var(--radius-block)',
  background: 'var(--panel-warm)',
};
// #55584e, не --ink-soft: тот же прецедент, что у тёплой плашки «Ждут
// отправки вручную» и сводки «Экзаменов» — на --panel-warm --ink-soft держит
// только ~4.06:1, ниже AA 4.5 для этого кегля; #55584e даёт 5.74:1
// (broadcasts/ManualDeliveriesSection.tsx, exams/ExamsSectionStats.tsx).
const rubricStyle: CSSProperties = {
  fontSize: 12,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: '#55584e',
};
const titleStyle: CSSProperties = { fontFamily: 'var(--font-display)', fontSize: 22 };
const metaStyle: CSSProperties = { fontSize: 14, color: '#55584e' };
const descriptionStyle: CSSProperties = { margin: 0, fontSize: 14, color: '#55584e' };
const actionRowStyle: CSSProperties = { marginTop: 4 };
// Остаток попыток стоит вплотную к кнопке: он объясняет именно её, а не
// карточку целиком.
const attemptsLeftStyle: CSSProperties = { ...metaStyle, margin: '0 0 6px' };

const ACTION_LABEL = {
  continue: 'Продолжить',
  start: 'Начать',
  retry: 'Пройти ещё раз',
} as const;

interface StudentExamCardProps {
  exam: MyExamDto;
  pending: boolean;
  error: string | null;
  onStart: () => void;
}

export function StudentExamCard({ exam, pending, error, onStart }: StudentExamCardProps) {
  const action = getMyExamAction(exam);
  const attempt = exam.lastAttempt;
  const showOutcome = attempt?.status === 'graded' && attempt.outcome !== undefined;
  // Итог учителя уже говорит, что с экзаменом сейчас, — вторая строка об
  // одном и том же читается как сбой.
  const state = showOutcome ? null : describeExamState(exam);
  // Попытку правда можно начать только этими двумя кнопками: «Продолжить»
  // открывает начатую, и остаток попыток к ней отношения не имеет.
  const showAttemptsLeft = action === 'start' || action === 'retry';

  return (
    <li>
      <div style={cardStyle}>
        <span style={rubricStyle}>{RUBRIC}</span>
        <span style={titleStyle}>{exam.title}</span>

        {/* Настоящее — первой строкой под названием. Для проверенной работы
            это итог с разбором учителя; пока оценки нет, блок не рисуется
            вовсе — честное отсутствие вместо пустых строк (CLAUDE.md «число
            в своём разделе»). */}
        {state && <span style={metaStyle}>{state}</span>}
        {showOutcome && attempt?.outcome && (
          <ExamAttemptOutcome outcome={attempt.outcome} comment={attempt.comment} />
        )}

        {exam.description && <p style={descriptionStyle}>{exam.description}</p>}

        {/* Кнопка — если есть что нажать; над ней остаток попыток, чтобы
            ученик знал цену нажатия до него, а не после. */}
        {action && (
          <div style={actionRowStyle}>
            {showAttemptsLeft && (
              <p style={attemptsLeftStyle}>{formatAttemptsLeft(exam)}</p>
            )}
            <Button type="button" variant="secondary" pending={pending} onClick={onStart}>
              {ACTION_LABEL[action]}
            </Button>
          </div>
        )}

        {error && (
          <p role="alert" style={{ margin: '6px 0 0', color: 'var(--danger)' }}>
            {error}
          </p>
        )}
      </div>
    </li>
  );
}
