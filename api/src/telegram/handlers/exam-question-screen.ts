// Экран «Вопрос N из M» — один вопрос попытки на сообщение (ТЗ 4б.2,
// ADR-0024, PLAN.md §12). Вопросы читаются из снимка попытки
// (ExamAttemptDto.blocks) по сквозному порядку — блоки формы сами по себе
// экрану не нужны, только порядок вопросов внутри них (тот же снимок, что
// в кабинете, web/src/attempt/AttemptBlock.tsx, только по одному вопросу,
// не всей формой сразу). Чистая логика без Mongo и без сети.
import {
  ATTEMPT_EXPIRED_MESSAGE,
  ATTEMPT_NOT_IN_PROGRESS_MESSAGE,
  type AttemptAnswerDto,
  type AttemptQuestionDto,
  type ExamAttemptDto,
} from '@xuanxue/shared';
import type { InlineKeyboardButton } from 'telegraf/types';
import { inlineButton } from '../callback-data';
import { backToMenuButton, type BotMenu } from './bot-menu';
import { buildOptionId, buildQuestionId } from './exam-callback-ids';

// Вопросы text/video в этой части не отвечаются в боте (PLAN.md §12 слой
// 4б.2, «дальше — следующим PR»): видео всё ещё принимает только отдельный
// путь через deep link из кабинета (ADR-0023, один видеофайл на попытку, не
// на вопрос) — притворяться, что его можно прислать прямо на этом экране,
// нельзя (задача, «не выдумывай заглушку, которая притворяется рабочей»).
const TEXT_QUESTION_NOTE =
  'Ответ на этот вопрос принимается в кабинете — там есть поле для текста, здесь его пока нет.';
const VIDEO_QUESTION_NOTE =
  'Видео этого вопроса ждёт вас на экране «Отправлено» в кабинете — пришлёте его боту, когда сдадите работу.';

const BACK_LABEL = 'Назад';
const NEXT_LABEL = 'Дальше';
const SUBMIT_LABEL = 'Сдать';
const SUBMITTED_NOW_TEXT = 'Работа отправлена. Учитель проверит и пришлёт результат.';

export function flattenAttemptQuestions(attempt: ExamAttemptDto): AttemptQuestionDto[] {
  return attempt.blocks.flatMap((block) => block.questions);
}

function findAnswer(
  answers: AttemptAnswerDto[],
  itemId: string,
): AttemptAnswerDto | undefined {
  return answers.find((answer) => answer.itemId === itemId);
}

function optionMark(kind: AttemptQuestionDto['kind'], selected: boolean): string {
  if (!selected) return kind === 'multiple' ? '☐ ' : '';
  return kind === 'multiple' ? '☑ ' : '✓ ';
}

function optionButtons(
  attemptId: string,
  index: number,
  question: AttemptQuestionDto,
  answer: AttemptAnswerDto | undefined,
): InlineKeyboardButton[][] {
  const selectedIds = new Set(answer?.optionIds ?? []);
  return question.options.map((option, optionIndex) => [
    inlineButton(
      `${optionMark(question.kind, selectedIds.has(option.id))}${option.text}`,
      'eo',
      buildOptionId(attemptId, index, optionIndex),
    ),
  ]);
}

function navButtons(
  attemptId: string,
  index: number,
  total: number,
): InlineKeyboardButton[] {
  const buttons: InlineKeyboardButton[] = [];
  if (index > 0) {
    buttons.push(inlineButton(BACK_LABEL, 'eq', buildQuestionId(attemptId, index - 1)));
  }
  buttons.push(
    index < total - 1
      ? inlineButton(NEXT_LABEL, 'eq', buildQuestionId(attemptId, index + 1))
      : inlineButton(SUBMIT_LABEL, 'es', attemptId),
  );
  return buttons;
}

function questionNote(kind: AttemptQuestionDto['kind']): string | null {
  if (kind === 'text') return TEXT_QUESTION_NOTE;
  if (kind === 'video') return VIDEO_QUESTION_NOTE;
  return null;
}

/** Экран вопроса попытки, ещё «в работе». Индекс вне снимка (защита в
 * глубину — устаревшая кнопка, попытка пересобрана) — честный откат к
 * «попытка не найдена» оставляем вызывающему коду, здесь просто пустой
 * экран без кнопок, ничего не рендерим как вопрос. */
export function buildQuestionScreen(attempt: ExamAttemptDto, index: number): BotMenu {
  const questions = flattenAttemptQuestions(attempt);
  const question = questions[index];
  if (!question) return { text: attempt.examTitle, buttons: [backToMenuButton()] };

  const answer = findAnswer(attempt.answers, question.itemId);
  const headerLine = `Вопрос ${index + 1} из ${questions.length}`;
  const promptLines = [question.prompt, question.hint].filter(Boolean).join('\n');
  const note = questionNote(question.kind);
  const text = [headerLine, promptLines, note].filter(Boolean).join('\n\n');

  const optionRows =
    question.kind === 'single' || question.kind === 'multiple'
      ? optionButtons(attempt.id, index, question, answer)
      : [];
  return {
    text,
    buttons: [...optionRows, navButtons(attempt.id, index, questions.length)],
  };
}

/** Экран попытки, которая больше не «в работе»: сдана вручную только что
 * (`justSubmitted`), сдана раньше или закрыта по дедлайну — тексты те же,
 * что уже показывает кабинет (ATTEMPT_EXPIRED_MESSAGE/
 * ATTEMPT_NOT_IN_PROGRESS_MESSAGE, shared/src/exams.ts), не второй текст той
 * же мысли. */
export function buildFinishedScreen(
  attempt: ExamAttemptDto,
  justSubmitted: boolean,
): BotMenu {
  const text = attempt.expired
    ? ATTEMPT_EXPIRED_MESSAGE
    : justSubmitted
      ? SUBMITTED_NOW_TEXT
      : ATTEMPT_NOT_IN_PROGRESS_MESSAGE;
  return { text, buttons: [backToMenuButton()] };
}
