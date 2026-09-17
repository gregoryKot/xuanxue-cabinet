// Экран «Экзамены» в боте (/exams, /экзамены, кнопка меню — ТЗ 4б.2,
// ADR-0024, PLAN.md §12): то же самое, что ученик видит в кабинете
// (MyExamsService.list через ExamBotPort — не второй запрос) — опубликованные
// формы и положение ученика по каждой. У строки — кнопка «Начать»/
// «Продолжить», либо честный текст, почему кнопки нет (попытки кончились,
// работа на проверке). Чистая логика без Mongo и без сети.
import type { MyExamDto } from '@xuanxue/shared';
import type { InlineKeyboardButton } from 'telegraf/types';
import { inlineButton } from '../callback-data';
import { backToMenuButton, type BotMenu } from './bot-menu';

const TITLE = 'Экзамены:';
const EMPTY_TEXT = 'Пока нечего сдавать: учитель ещё не опубликовал ни одной формы.';
const SUBMITTED_TEXT = 'Сдано, ждёт проверки.';
const BUTTON_TITLE_MAX = 40;

interface ExamRowStatus {
  actionLabel?: string;
  reason?: string;
}

/** `start()` (ExamAttemptsService) сам возвращает незаконченную попытку
 * вместо новой и сам отказывает, когда попыток больше не осталось — здесь
 * только то, что можно сказать заранее по данным списка, не второе решение
 * того же правила. */
function examRowStatus(exam: MyExamDto): ExamRowStatus {
  if (exam.lastAttempt?.status === 'in_progress') return { actionLabel: 'Продолжить' };
  if (exam.attemptsUsed < exam.attemptsAllowed) {
    return { actionLabel: exam.attemptsUsed === 0 ? 'Начать' : 'Начать ещё раз' };
  }
  if (exam.lastAttempt?.status === 'submitted') return { reason: SUBMITTED_TEXT };
  return {
    reason: `Использованы все попытки — ${exam.attemptsUsed} из ${exam.attemptsAllowed}.`,
  };
}

function truncateForButton(title: string): string {
  return title.length > BUTTON_TITLE_MAX
    ? `${title.slice(0, BUTTON_TITLE_MAX - 1)}…`
    : title;
}

interface ExamRow {
  line: string;
  button?: InlineKeyboardButton[];
}

function buildExamRow(exam: MyExamDto): ExamRow {
  const header = exam.level ? `${exam.title} (${exam.level})` : exam.title;
  const status = examRowStatus(exam);
  const line = status.reason ? `${header}\n${status.reason}` : header;
  const button = status.actionLabel
    ? [
        inlineButton(
          `${status.actionLabel}: ${truncateForButton(exam.title)}`,
          'exam',
          exam.id,
        ),
      ]
    : undefined;
  return { line, button };
}

export function buildExamListScreen(exams: MyExamDto[]): BotMenu {
  if (exams.length === 0) return { text: EMPTY_TEXT, buttons: [backToMenuButton()] };
  const rows = exams.map(buildExamRow);
  const text = `${TITLE}\n\n${rows.map((row) => row.line).join('\n\n')}`;
  const buttons: InlineKeyboardButton[][] = [
    ...rows.flatMap((row) => (row.button ? [row.button] : [])),
    backToMenuButton(),
  ];
  return { text, buttons };
}
