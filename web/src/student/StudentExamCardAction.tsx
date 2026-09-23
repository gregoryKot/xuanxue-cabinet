// Кнопка «Начать»/«Продолжить»/«Пройти ещё раз» — или, когда новую попытку
// начать нельзя из-за срока сдачи, честная строка вместо неё (ADR-0125).
// Вынесено из StudentExamCard.tsx: карточка упёрлась в лимит размера файла
// (CLAUDE.md «Храповики», 150 строк), тот же приём, что у ExamAttemptOutcome.
import {
  EXAM_DUE_PASSED_MESSAGE,
  type MyExamAction,
  type MyExamDto,
} from '@xuanxue/shared';
import { Button } from '../components/Button';
import { dueAtLine, formatAttemptsLeft } from './examAttemptState';
import { actionRowStyle, attemptsLeftStyle, metaStyle } from './studentExamCardStyles';

const ACTION_LABEL = {
  continue: 'Продолжить',
  start: 'Начать',
  retry: 'Пройти ещё раз',
} as const;

interface StudentExamCardActionProps {
  exam: MyExamDto;
  action: Exclude<MyExamAction, null>;
  running: boolean;
  timeLine: string | null;
  /** Срок сдачи прошёл (useExamDuePassed, ADR-0125) — блокирует кнопку
   * только вместе с «Начать»/«Пройти ещё раз» ниже, «Продолжить» её не
   * видит: идущую попытку срок не трогает никогда. */
  duePassed: boolean;
  pending: boolean;
  onStart: () => void;
}

export function StudentExamCardAction({
  exam,
  action,
  running,
  timeLine,
  duePassed,
  pending,
  onStart,
}: StudentExamCardActionProps) {
  // Попытку правда можно начать только этими двумя кнопками: «Продолжить»
  // открывает начатую, и ни остаток попыток, ни срок к ней отношения не имеют.
  const showAttemptsLeft = action === 'start' || action === 'retry';
  const due = dueAtLine(exam.dueAt);

  if (showAttemptsLeft && duePassed) {
    return (
      <div style={actionRowStyle}>
        {due && <p style={attemptsLeftStyle}>{due}</p>}
        <p style={metaStyle}>{EXAM_DUE_PASSED_MESSAGE}</p>
      </div>
    );
  }

  return (
    <div style={actionRowStyle}>
      {showAttemptsLeft && <p style={attemptsLeftStyle}>{formatAttemptsLeft(exam)}</p>}
      {!running && timeLine && <p style={attemptsLeftStyle}>{timeLine}</p>}
      {showAttemptsLeft && due && <p style={attemptsLeftStyle}>{due}</p>}
      <Button type="button" variant="secondary" pending={pending} onClick={onStart}>
        {ACTION_LABEL[action]}
      </Button>
    </div>
  );
}
