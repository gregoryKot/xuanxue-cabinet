// Стоит ли спрашивать подтверждение перед стартом попытки (просьба владельца
// 2026-09-22: «индикацию ВЫ НАЧИНАЕТЕ ЭКЗАМЕН я бы сделал поярче») — чистая
// функция, не выражение в JSX (CLAUDE.md «Логика вне компонентов»). Решение
// используют и TasksScreen.tsx (что показать), и useExamStart.ts (спросить
// или сразу слать POST) — одно место на оба.
//
// Спрашиваем в двух случаях: у формы есть лимит времени и отсчёт стартует
// ЗАНОВО (`start`/`retry`) — тот же вопрос, что раньше; либо повтор затирает
// прошлую просроченную попытку (`retry` после `expired`, отзыв тестировщицы
// 2026-09-23, п.4, ADR-0131) — тогда спрашиваем, даже если у формы вовсе нет
// лимита времени: удаление разрушительно само по себе, часы здесь ни при
// чём. «Продолжить» (`continue`, часы уже идут) и повтор после проверенной
// работы (`graded`, ничего не удаляется) уходят без диалога, POST шлётся
// сразу, как раньше.
import {
  buildExamRetryDeleteWarning,
  buildExamStartWarning,
  getMyExamAction,
  willRetryDeletePreviousAttempt,
  EXAM_START_CANCEL_LABEL,
  EXAM_START_CONFIRM_LABEL,
  EXAM_START_CONFIRM_TITLE,
  EXAM_RETRY_DELETE_CONFIRM_LABEL,
  EXAM_RETRY_DELETE_CONFIRM_TITLE,
  EXAM_RETRY_DELETE_FACT,
  type MyExamDto,
} from '@xuanxue/shared';
import type { ButtonVariant } from '../components/Button';

export interface ExamStartConfirm {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  /** `danger` для повтора, затирающего прошлую попытку — она правда исчезнет,
   * не просто «начинается заново» (ConfirmDialog.tsx: `danger` по умолчанию
   * там означает именно необратимость, не тревогу вообще). Обычный старт —
   * `primary`, красная кнопка не читалась бы как опасность. */
  confirmVariant: ButtonVariant;
}

export function getExamStartConfirm(exam: MyExamDto): ExamStartConfirm | null {
  const action = getMyExamAction(exam);
  if (action !== 'start' && action !== 'retry') return null;

  if (action === 'retry' && willRetryDeletePreviousAttempt(exam)) {
    // Факт удаления — полужирным на экране (CLAUDE.md «Акценты», ADR-0124):
    // маркер `**` живёт только в web/, поэтому оборачиваем здесь, а не в
    // shared/exam-time-notice.ts (там же и причина, почему константа факта
    // отдельная, не часть готового предложения).
    const message = buildExamRetryDeleteWarning(exam.timeLimitMin).replace(
      EXAM_RETRY_DELETE_FACT,
      `**${EXAM_RETRY_DELETE_FACT}**`,
    );
    return {
      title: EXAM_RETRY_DELETE_CONFIRM_TITLE,
      message,
      confirmLabel: EXAM_RETRY_DELETE_CONFIRM_LABEL,
      cancelLabel: EXAM_START_CANCEL_LABEL,
      confirmVariant: 'danger',
    };
  }

  const timeLimitMin = exam.timeLimitMin;
  if (!timeLimitMin) return null;
  return {
    title: EXAM_START_CONFIRM_TITLE,
    message: buildExamStartWarning(timeLimitMin),
    confirmLabel: EXAM_START_CONFIRM_LABEL,
    cancelLabel: EXAM_START_CANCEL_LABEL,
    confirmVariant: 'primary',
  };
}
