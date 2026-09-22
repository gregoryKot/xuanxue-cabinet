// Экран «Экзамены» в боте (/exams, /экзамены, кнопка меню — ТЗ 4б.2,
// ADR-0024, PLAN.md §12): то же самое, что ученик видит в кабинете
// (MyExamsService.list через ExamBotPort — не второй запрос) — опубликованные
// формы и положение ученика по каждой. У строки — кнопка «Начать»/
// «Продолжить»/«Начать ещё раз», либо честный текст, почему кнопки нет
// (попытки кончились, работа на проверке). Чистая логика без Mongo и без сети.
//
// Что предложить нажать — решает одна функция на кабинет и на бота
// (getMyExamAction, shared/src/my-exams.ts, ADR-0091): здесь только подписи
// кнопки и текст причины, когда кнопки нет. До этого решения бот считал
// правило сам и пускал на «Начать ещё раз» любую сданную работу, даже ещё не
// проверенную, — сюда это больше не возвращается.
//
// Кнопка формы с лимитом времени у «Начать»/«Начать ещё раз» ведёт на `exc`
// — вопрос «Вы начинаете экзамен» перед стартом (ADR-0121, отзыв владельца
// 2026-09-22), а не сразу на `exam`. «Продолжить» — часы уже тикают, вопрос
// запоздал бы; форма без лимита — тоже сразу на `exam`, спрашивать нечего.
import {
  describeExamTime,
  getMyExamAction,
  SCHOOL_TZ,
  type MyExamAction,
  type MyExamDto,
} from '@xuanxue/shared';
import type { InlineKeyboardButton } from 'telegraf/types';
import { inlineButton } from '../callback-data';
import { backToMenuButton, type BotMenu } from './bot-menu';
import { buildQuestionId, CONTINUE_QUESTION_INDEX } from './exam-callback-ids';

const TITLE = 'Экзамены:';
const EMPTY_TEXT = 'Пока нечего сдавать.';
const SUBMITTED_TEXT = 'Сдано, ждёт проверки.';
const BUTTON_TITLE_MAX = 40;

const ACTION_LABELS: Record<Exclude<MyExamAction, null>, string> = {
  continue: 'Продолжить',
  start: 'Начать',
  retry: 'Начать ещё раз',
};

interface ExamRowStatus {
  action?: Exclude<MyExamAction, null>;
  reason?: string;
}

/** `start()` (ExamAttemptsService) сам возвращает незаконченную попытку
 * вместо новой и сам отказывает, когда попыток больше не осталось — здесь
 * только то, что можно сказать заранее по данным списка, не второе решение
 * того же правила. */
function examRowStatus(exam: MyExamDto): ExamRowStatus {
  const action = getMyExamAction(exam);
  if (action) return { action };
  if (exam.lastAttempt?.status === 'submitted') return { reason: SUBMITTED_TEXT };
  return {
    reason: `Использованы все попытки — ${exam.attemptsUsed} из ${exam.attemptsAllowed}.`,
  };
}

/** «Продолжить» ведёт прямо на существующую попытку по её id (`eq` →
 * handleExamQuestion), не через `exam:<examId>` (ExamAttemptsService.start):
 * тот же вызов для уже отправленной работы вместо повтора заводит новую
 * пустую попытку и молча списывает её из лимита — сообщение со старыми
 * кнопками в чате висит вечно, обновить его нечем (отзыв владельца
 * 2026-09-22, ADR-0119). Номер вопроса список не знает — снимок попытки
 * сюда не едет (MyExamDto, my-exams.ts) — CONTINUE_QUESTION_INDEX просит
 * handleExamQuestion найти первый вопрос без ответа самому.
 *
 * «Начать» и «Начать ещё раз» у формы с лимитом времени ведут на `exc` —
 * вопрос перед стартом (ADR-0121): часы пойдут сразу, и ученик вправе
 * узнать об этом до нажатия, а не после. Без лимита спрашивать нечего, и
 * кнопка заводит попытку сразу, как раньше. */
function buildActionButton(
  exam: MyExamDto,
  action: Exclude<MyExamAction, null>,
): InlineKeyboardButton {
  const text = `${ACTION_LABELS[action]}: ${truncateForButton(exam.title)}`;
  if (action === 'continue' && exam.lastAttempt) {
    return inlineButton(
      text,
      'eq',
      buildQuestionId(exam.lastAttempt.id, CONTINUE_QUESTION_INDEX),
    );
  }
  return inlineButton(text, exam.timeLimitMin ? 'exc' : 'exam', exam.id);
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

function buildExamRow(exam: MyExamDto, nowMs: number): ExamRow {
  const header = exam.level ? `${exam.title} (${exam.level})` : exam.title;
  const status = examRowStatus(exam);
  // Бот не знает часов зрителя (в отличие от кабинета, ADR-0060) — время
  // экзамена показывает по часам школы и всегда подписывает пояс, иначе
  // ученик прочтёт час закрытия как свой собственный.
  const timeLine = describeExamTime(exam, {
    nowMs,
    timeZone: SCHOOL_TZ,
    zoneNote: `(${SCHOOL_TZ})`,
  });
  const lines = [header, timeLine, status.reason].filter(
    (line): line is string => line !== null && line !== undefined,
  );
  const line = lines.join('\n');
  const button = status.action ? [buildActionButton(exam, status.action)] : undefined;
  return { line, button };
}

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
