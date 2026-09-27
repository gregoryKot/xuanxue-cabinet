// Экран подтверждения перед стартом попытки с лимитом времени (действие
// `exc`, callback-data.ts) — отзыв владельца 2026-09-22: «индикацию ВЫ
// НАЧИНАЕТЕ ЭКЗАМЕН я бы сделал поярче». До этого экрана кнопка списка
// (exam-list-screen.ts) сразу слала `exam:<id>` и часы запускались без
// единого слова — теперь у формы с лимитом между списком и стартом встаёт
// этот вопрос, и только его кнопка «Начать экзамен» заводит попытку
// (exam-attempt-navigation.ts, handleExamStartConfirm). Текст — общий с
// кабинетом (shared/src/exam-time-notice.ts, ADR-0121): та же мысль одними
// словами в обоих местах. Чистая логика без Mongo и без Telegram.
//
// `deletesPrevious` (отзыв тестировщицы 2026-09-23, п.4, ADR-0131) — тот же
// экран показывает и предупреждение о повторе, затирающем прошлую
// просроченную попытку: заголовок, текст и подпись кнопки меняются на
// EXAM_RETRY_DELETE_*, лимита времени у формы для этого может не быть вовсе
// (buildExamRetryDeleteWarning сам решает, добавлять ли часть про часы).
import {
  EXAM_START_CONFIRM_TITLE,
  EXAM_START_CONFIRM_LABEL,
  EXAM_START_CANCEL_LABEL,
  EXAM_RETRY_DELETE_CONFIRM_TITLE,
  EXAM_RETRY_DELETE_CONFIRM_LABEL,
  buildExamRetryDeleteWarning,
  buildExamStartWarning,
} from '@xuanxue/shared';
import { inlineButton } from '../callback-data';
import type { BotMenu } from './bot-menu';

export function buildExamStartConfirmScreen(
  examId: string,
  timeLimitMin: number | undefined,
  deletesPrevious: boolean,
): BotMenu {
  // Без лимита времени и без удаления сюда не попадают вовсе —
  // handleExamStartConfirm решает это ДО вызова (та же граница, что у
  // web/examStartConfirm.ts): обычная ветка ниже остаётся без лимита только
  // если он и правда null, а это программная ошибка вызывающего кода.
  if (!deletesPrevious && timeLimitMin === undefined) {
    throw new Error('buildExamStartConfirmScreen: нет ни лимита времени, ни удаления');
  }
  const title = deletesPrevious
    ? EXAM_RETRY_DELETE_CONFIRM_TITLE
    : EXAM_START_CONFIRM_TITLE;
  const confirmLabel = deletesPrevious
    ? EXAM_RETRY_DELETE_CONFIRM_LABEL
    : EXAM_START_CONFIRM_LABEL;
  // Каст безопасен рантайм-проверкой выше: типы не видят связь между
  // `deletesPrevious` и `timeLimitMin` через два разных параметра.
  const warning = deletesPrevious
    ? buildExamRetryDeleteWarning(timeLimitMin)
    : buildExamStartWarning(timeLimitMin as number);
  const text = `${title}\n\n${warning}`;
  return {
    text,
    buttons: [
      [inlineButton(confirmLabel, 'exam', examId)],
      // «Не сейчас» — назад к списку заданий (menu:exams, bot-menu.ts), не в
      // никуда: человек вправе закрыть вопрос и вернуться, когда у него
      // будет время (buildExamStartWarning — тот же комментарий).
      [inlineButton(EXAM_START_CANCEL_LABEL, 'menu', 'exams')],
    ],
  };
}
