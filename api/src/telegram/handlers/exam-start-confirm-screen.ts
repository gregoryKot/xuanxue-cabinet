// Экран подтверждения перед стартом попытки с лимитом времени (действие
// `exc`, callback-data.ts) — отзыв владельца 2026-09-22: «индикацию ВЫ
// НАЧИНАЕТЕ ЭКЗАМЕН я бы сделал поярче». До этого экрана кнопка списка
// (exam-list-screen.ts) сразу слала `exam:<id>` и часы запускались без
// единого слова — теперь у формы с лимитом между списком и стартом встаёт
// этот вопрос, и только его кнопка «Начать экзамен» заводит попытку
// (exam-attempt-navigation.ts, handleExamStartConfirm). Текст — общий с
// кабинетом (shared/src/exam-time-notice.ts, ADR-0091): та же мысль одними
// словами в обоих местах. Чистая логика без Mongo и без Telegram.
import {
  EXAM_START_CONFIRM_TITLE,
  EXAM_START_CONFIRM_LABEL,
  EXAM_START_CANCEL_LABEL,
  buildExamStartWarning,
} from '@xuanxue/shared';
import { inlineButton } from '../callback-data';
import type { BotMenu } from './bot-menu';

export function buildExamStartConfirmScreen(
  examId: string,
  timeLimitMin: number,
): BotMenu {
  const text = `${EXAM_START_CONFIRM_TITLE}\n\n${buildExamStartWarning(timeLimitMin)}`;
  return {
    text,
    buttons: [
      [inlineButton(EXAM_START_CONFIRM_LABEL, 'exam', examId)],
      // «Не сейчас» — назад к списку заданий (menu:exams, bot-menu.ts), не в
      // никуда: человек вправе закрыть вопрос и вернуться, когда у него
      // будет время (buildExamStartWarning — тот же комментарий).
      [inlineButton(EXAM_START_CANCEL_LABEL, 'menu', 'exams')],
    ],
  };
}
