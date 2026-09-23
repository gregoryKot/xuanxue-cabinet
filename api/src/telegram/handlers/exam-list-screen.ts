// Экран «Экзамены» в боте (/exams, /экзамены, кнопка меню — ТЗ 4б.2,
// ADR-0024, PLAN.md §12): то же самое, что ученик видит в кабинете
// (MyExamsService.list через ExamBotPort — не второй запрос) — опубликованные
// формы и положение ученика по каждой. Строка каждой формы и её кнопка —
// exam-list-row.ts (файл-лимит 150 строк развёл экран и строку). Чистая
// логика без Mongo и без сети.
import type { MyExamDto } from '@xuanxue/shared';
import type { InlineKeyboardButton } from 'telegraf/types';
import { backToMenuButton, type BotMenu } from './bot-menu';
import { buildExamRow } from './exam-list-row';

const TITLE = 'Экзамены:';
const EMPTY_TEXT = 'Пока нечего сдавать.';

export function buildExamListScreen(exams: MyExamDto[], nowMs: number): BotMenu {
  if (exams.length === 0) return { text: EMPTY_TEXT, buttons: [backToMenuButton()] };
  const rows = exams.map((exam) => buildExamRow(exam, nowMs));
  const text = `${TITLE}\n\n${rows.map((row) => row.line).join('\n\n')}`;
  const buttons: InlineKeyboardButton[][] = [
    ...rows.flatMap((row) => (row.button ? [row.button] : [])),
    backToMenuButton(),
  ];
  return { text, buttons };
}
