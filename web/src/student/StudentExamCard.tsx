// Карточка одного экзамена на экране ученика (ТЗ п.1, результат — ТЗ слоя
// 4.7): название, описание, сколько попыток осталось, состояние последней
// попытки простыми словами, одна кнопка по смыслу — а если работу уже
// проверили, ещё и итог с комментарием учителя. Облик — тёплая плашка
// `--panel-warm` (макет 1c-planning.html, docs/adr/0043), тот же приём, что у
// «Ждут отправки вручную» (broadcasts/ManualDeliveriesSection.tsx) и сводки
// экзаменов (exams/ExamsSectionStats.tsx). Кнопка остаётся вторичной
// (`variant="secondary"`), хотя макет рисует её залитой: заливка терракотой
// уже занята «Подключиться» у ближайшего занятия выше на этом же экране
// (StudentLessonMeeting.tsx) — правило «один акцент на экран» (ADR-0043) не
// делает исключения для второй кнопки того же цвета. Итог вынесен в
// ExamAttemptOutcome — своя логика, что показывать, не должна раздувать саму
// карточку (CLAUDE.md «Храповики», лимит 150 строк). Строка про время —
// useExamTimeLine.ts: её текст считает shared (один на кабинет и бота), а
// тик раз в полминуты не должен жить в карточке.
import type { CSSProperties } from 'react';
import { getMyExamAction, type MyExamDto } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { ExamAttemptOutcome } from './ExamAttemptOutcome';
import { describeNoAction, formatAttemptsLeft } from './examAttemptState';
import { useExamTimeLine } from './useExamTimeLine';

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

const ACTION_LABEL = {
  continue: 'Продолжить',
  start: 'Начать',
  retry: 'Пройти ещё раз',
} as const;

// Кнопка «Пройти ещё раз» бывает по двум разным причинам (getMyExamAction,
// shared): учитель посмотрел работу и попросил доработать — там уже есть
// итог с комментарием (ExamAttemptOutcome ниже), объяснять нечего; либо
// время истекло раньше, чем ученик успел сдать сам — без строки рядом кнопка
// выглядела бы случайной (CLAUDE.md: «каждая фича объясняет, откуда это»).
const EXPIRED_RETRY_NOTE = 'Прошлую попытку закрыло время';

interface StudentExamCardProps {
  exam: MyExamDto;
  pending: boolean;
  error: string | null;
  onStart: () => void;
}

export function StudentExamCard({ exam, pending, error, onStart }: StudentExamCardProps) {
  const action = getMyExamAction(exam);
  const timeLine = useExamTimeLine(exam);
  const attempt = exam.lastAttempt;
  const showOutcome = attempt?.status === 'graded' && attempt.outcome !== undefined;
  // Не «весь retry» — только та его причина, которую сам экран ещё не
  // объяснил итогом учителя (см. комментарий у EXPIRED_RETRY_NOTE).
  const showExpiredNote =
    action === 'retry' && attempt?.status === 'submitted' && attempt.expired;

  return (
    <li>
      <div style={cardStyle}>
        <span style={rubricStyle}>{RUBRIC}</span>
        <span style={titleStyle}>{exam.title}</span>
        <span style={metaStyle}>{formatAttemptsLeft(exam)}</span>
        {/* Время попытки идёт, пока ученик вышел, и просроченную попытку
            сервер закрывает сам (ADR-0120) — остаток он обязан видеть здесь,
            а не только внутри самой попытки. У формы без лимита времени
            строки нет вовсе. */}
        {timeLine && <span style={metaStyle}>{timeLine}</span>}
        {exam.description && <p style={descriptionStyle}>{exam.description}</p>}

        {/* Итог — рядом с кнопкой, а не вместо неё: после «нужно доработать»
            ученик и читает разбор, и жмёт «Пройти ещё раз» на той же
            карточке. Пока оценки нет, блок не рисуется вовсе — честное
            отсутствие вместо пустых строк (CLAUDE.md «число в своём
            разделе»). */}
        {showOutcome && attempt?.outcome && (
          <div style={actionRowStyle}>
            <ExamAttemptOutcome outcome={attempt.outcome} comment={attempt.comment} />
          </div>
        )}

        {/* Кнопка — если есть что нажать. Строки «Экзамен проверен» под
            итогом не будет: заголовок итога говорит то же самое, а два
            сообщения об одном читаются как сбой. */}
        {action ? (
          <div style={actionRowStyle}>
            {showExpiredNote && <p style={metaStyle}>{EXPIRED_RETRY_NOTE}</p>}
            <Button type="button" variant="secondary" pending={pending} onClick={onStart}>
              {ACTION_LABEL[action]}
            </Button>
          </div>
        ) : (
          !showOutcome && (
            <div style={actionRowStyle}>
              <p style={metaStyle}>{describeNoAction(exam)}</p>
            </div>
          )
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
