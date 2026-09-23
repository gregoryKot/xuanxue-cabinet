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
//
// Строка про время (useExamTimeLine.ts, ADR-0122) встаёт по тому же
// правилу: у идущей попытки остаток — настоящее, он под названием; у
// незапущенной «На попытку даётся 40 минут» — цена нажатия, и она стоит у
// кнопки рядом с остатком попыток. Текст обеим строкам считает shared, один
// на кабинет и бота.
//
// «Идёт экзамен» видно без захода внутрь (отзыв владельца 2026-09-22,
// ADR-0121: «индикацию ИДЁТ ЭКЗАМЕН я бы сделал поярче»): у карточки с
// идущей попыткой рубрика меняется на EXAM_IN_PROGRESS_LABEL (общий текст с
// ботом, shared/src/exam-time-notice.ts) и слева встаёт полоса акцентного
// цвета — тот же приём, что у непроверенного вопроса разбора
// (.xuanxue-question-row--unanswered, index.css). Правило «один акцент на
// экран» (ADR-0043) не тронуто: заливки нет, кнопка остаётся `secondary`.
import { Link } from 'react-router-dom';
import { EXAM_IN_PROGRESS_LABEL, getMyExamAction, type MyExamDto } from '@xuanxue/shared';
import { textLinkStyle } from '../components/screenLayout';
import { ExamAttemptOutcome } from './ExamAttemptOutcome';
import { describeExamState } from './examAttemptState';
import {
  actionRowStyle,
  cardStyle,
  descriptionStyle,
  metaStyle,
  rubricStyle,
  runningCardStyle,
  runningRubricStyle,
  titleStyle,
} from './studentExamCardStyles';
import { StudentExamCardAction } from './StudentExamCardAction';
import { useExamDuePassed } from './useExamDuePassed';
import { useExamTimeLine } from './useExamTimeLine';

const RUBRIC = 'Экзамен';

const REVIEW_LINK_TEXT = 'Посмотреть свою работу';

interface StudentExamCardProps {
  exam: MyExamDto;
  pending: boolean;
  error: string | null;
  onStart: () => void;
}

export function StudentExamCard({ exam, pending, error, onStart }: StudentExamCardProps) {
  const action = getMyExamAction(exam);
  const attempt = exam.lastAttempt;
  const timeLine = useExamTimeLine(exam);
  // Время идёт, пока ученик вышел, и просроченную попытку сервер закрывает
  // сам (ADR-0122) — у идущей попытки остаток стоит в настоящем, под
  // названием, а не у кнопки.
  const running = attempt?.status === 'in_progress';
  const showOutcome = attempt?.status === 'graded' && attempt.outcome !== undefined;
  // Итог учителя уже говорит, что с экзаменом сейчас, — вторая строка об
  // одном и том же читается как сбой.
  const state = showOutcome ? null : describeExamState(exam);
  // Срок сдачи (ADR-0125) — StudentExamCardAction сам решает, кого он
  // касается («Начать»/«Пройти ещё раз»), «Продолжить» его не видит.
  const duePassed = useExamDuePassed(exam);
  // Попытка в работе уже открывается кнопкой «Продолжить» — ссылка нужна
  // ровно там, где кнопки на вход нет: сдал сам или закрыло время.
  const showReviewLink = attempt !== undefined && attempt.status !== 'in_progress';

  return (
    <li>
      <div style={running ? runningCardStyle : cardStyle}>
        <span style={running ? runningRubricStyle : rubricStyle}>
          {running ? EXAM_IN_PROGRESS_LABEL : RUBRIC}
        </span>
        <span style={titleStyle}>{exam.title}</span>

        {/* Настоящее — первой строкой под названием. Для проверенной работы
            это итог с разбором учителя; пока оценки нет, блок не рисуется
            вовсе — честное отсутствие вместо пустых строк (CLAUDE.md «число
            в своём разделе»). */}
        {state && <span style={metaStyle}>{state}</span>}
        {running && timeLine && <span style={metaStyle}>{timeLine}</span>}
        {showOutcome && attempt?.outcome && (
          <ExamAttemptOutcome outcome={attempt.outcome} comment={attempt.comment} />
        )}

        {exam.description && <p style={descriptionStyle}>{exam.description}</p>}

        {/* Кнопка — если есть что нажать; над ней остаток попыток и срок
            сдачи, чтобы ученик знал цену нажатия до него, а не после. Срок
            прошёл для «Начать»/«Пройти ещё раз» — StudentExamCardAction
            сам рисует вместо кнопки честную строку (ADR-0125). */}
        {action && (
          <StudentExamCardAction
            exam={exam}
            action={action}
            running={running}
            timeLine={timeLine}
            duePassed={duePassed}
            pending={pending}
            onStart={onStart}
          />
        )}

        {/* Ссылка, не вторая кнопка: главное действие на карточке одно
            (ADR-0043). Ведёт на экран сдачи — он же читает попытку и рисует
            её ответы в выключенном виде (attempt/AttemptSubmittedAnswers.tsx,
            docs/adr/0123), уже сделанного не выдавая за форму. */}
        {showReviewLink && attempt && (
          <div style={actionRowStyle}>
            <Link to={`/attempts/${attempt.id}`} style={textLinkStyle}>
              {REVIEW_LINK_TEXT}
            </Link>
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
