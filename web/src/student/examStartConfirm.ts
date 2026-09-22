// Стоит ли спрашивать подтверждение перед стартом попытки (просьба владельца
// 2026-09-22: «индикацию ВЫ НАЧИНАЕТЕ ЭКЗАМЕН я бы сделал поярче») — чистая
// функция, не выражение в JSX (CLAUDE.md «Логика вне компонентов»). Решение
// используют и TasksScreen.tsx (что показать), и useExamStart.ts (спросить
// или сразу слать POST) — одно место на оба.
//
// Спрашиваем только там, где отсчёт стартует ЗАНОВО и у формы есть лимит
// времени: `start` (попытки не было) и `retry` (повтор после прошлой).
// «Продолжить» (`continue`, часы уже идут — вопрос запоздал бы) и форма без
// лимита (`timeLimitMin` не задан — часы никого не поджимают) уходят без
// диалога, POST шлётся сразу, как раньше.
import {
  buildExamStartWarning,
  getMyExamAction,
  EXAM_START_CANCEL_LABEL,
  EXAM_START_CONFIRM_LABEL,
  EXAM_START_CONFIRM_TITLE,
  type MyExamDto,
} from '@xuanxue/shared';

export interface ExamStartConfirm {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
}

export function getExamStartConfirm(exam: MyExamDto): ExamStartConfirm | null {
  if (!exam.timeLimitMin) return null;
  const action = getMyExamAction(exam);
  if (action !== 'start' && action !== 'retry') return null;
  return {
    title: EXAM_START_CONFIRM_TITLE,
    message: buildExamStartWarning(exam.timeLimitMin),
    confirmLabel: EXAM_START_CONFIRM_LABEL,
    cancelLabel: EXAM_START_CANCEL_LABEL,
  };
}
