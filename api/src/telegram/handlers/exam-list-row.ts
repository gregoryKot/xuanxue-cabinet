// Строка одной формы в списке «Экзамены» бота (ТЗ 4б.2, ADR-0024, PLAN.md
// §12) — вынесено из exam-list-screen.ts (файл-лимит 150 строк, CLAUDE.md
// «Храповики»), тем же приёмом, что exam-start-guards.ts у сервиса.
//
// Что предложить нажать — решает одна функция на кабинет и на бота
// (getMyExamAction, shared/src/my-exams.ts, ADR-0091): здесь только подписи
// кнопки и текст причины, когда кнопки нет.
//
// Срок сдачи (ADR-0125) — виден рядом со статусом только у «Начать»/«Начать
// ещё раз», до и после срока: ученик решает, отложить экзамен на вечер, зная
// дедлайн заранее. «Продолжить» срок не видит вовсе — идущую попытку он не
// останавливает никогда (ExamAttemptsService.start, exam-start-guards.ts), а
// строка рядом с этой кнопкой заставила бы гадать, не выкинет ли посреди
// работы. Тот же выбор, что и у кабинета (StudentExamCardAction.tsx) —
// getMyExamAction сам не знает про dueAt (ADR-0125), решение — здесь.
import {
  describeExamTime,
  EXAM_DUE_PASSED_MESSAGE,
  formatExamDueAt,
  getMyExamAction,
  isExamDuePassed,
  SCHOOL_TZ,
  type MyExamAction,
  type MyExamDto,
} from '@xuanxue/shared';
import type { InlineKeyboardButton } from 'telegraf/types';
import { inlineButton } from '../callback-data';
import { buildQuestionId, CONTINUE_QUESTION_INDEX } from './exam-callback-ids';

const SUBMITTED_TEXT = 'Сдано, ждёт проверки.';
const BUTTON_TITLE_MAX = 40;
const DUE_PREFIX = 'Сдать до';

const ACTION_LABELS: Record<Exclude<MyExamAction, null>, string> = {
  continue: 'Продолжить',
  start: 'Начать',
  retry: 'Начать ещё раз',
};

interface ExamRowStatus {
  action?: Exclude<MyExamAction, null>;
  reason?: string;
  /** Срок сдачи виден в строке — только у «Начать»/«Начать ещё раз»
   * (комментарий у шапки файла). */
  showDue: boolean;
}

/** `start()` (ExamAttemptsService) сам возвращает незаконченную попытку
 * вместо новой и сам отказывает, когда попыток больше не осталось или срок
 * прошёл, — здесь только то, что можно сказать заранее по данным списка, не
 * второе решение тех же правил. */
function examRowStatus(exam: MyExamDto, nowMs: number): ExamRowStatus {
  const action = getMyExamAction(exam);
  const showDue = action === 'start' || action === 'retry';
  if (showDue && isExamDuePassed(exam.dueAt, nowMs)) {
    return { reason: EXAM_DUE_PASSED_MESSAGE, showDue };
  }
  if (action) return { action, showDue };
  if (exam.lastAttempt?.status === 'submitted')
    return { reason: SUBMITTED_TEXT, showDue };
  return {
    reason: `Использованы все попытки — ${exam.attemptsUsed} из ${exam.attemptsAllowed}.`,
    showDue,
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

/** «Сдать до 30 сентября, 23:59 (Asia/Jerusalem)» — часы школы, пояс подписан
 * всегда: бот не знает часов зрителя (ADR-0060), ровно как у timeLine ниже.
 * `null` — срока нет, строки не будет вовсе. */
function formatDueLine(dueAt: string | undefined): string | null {
  const formatted = formatExamDueAt(dueAt, {
    timeZone: SCHOOL_TZ,
    zoneNote: `(${SCHOOL_TZ})`,
  });
  return formatted ? `${DUE_PREFIX} ${formatted}` : null;
}

export interface ExamRow {
  line: string;
  button?: InlineKeyboardButton[];
}

export function buildExamRow(exam: MyExamDto, nowMs: number): ExamRow {
  const header = exam.level ? `${exam.title} (${exam.level})` : exam.title;
  const status = examRowStatus(exam, nowMs);
  // Бот не знает часов зрителя (в отличие от кабинета, ADR-0060) — время
  // экзамена показывает по часам школы и всегда подписывает пояс, иначе
  // ученик прочтёт час закрытия как свой собственный.
  const timeLine = describeExamTime(exam, {
    nowMs,
    timeZone: SCHOOL_TZ,
    zoneNote: `(${SCHOOL_TZ})`,
  });
  const dueLine = status.showDue ? formatDueLine(exam.dueAt) : null;
  const lines = [header, timeLine, dueLine, status.reason].filter(
    (line): line is string => line !== null && line !== undefined,
  );
  const line = lines.join('\n');
  const button = status.action ? [buildActionButton(exam, status.action)] : undefined;
  return { line, button };
}
