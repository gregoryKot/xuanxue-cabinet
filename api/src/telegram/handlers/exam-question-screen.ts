// Экран «Вопрос N из M» — один вопрос попытки на сообщение (ТЗ 4б.2,
// ADR-0024, PLAN.md §12). Вопросы читаются из снимка попытки
// (ExamAttemptDto.blocks) по сквозному порядку — блоки формы сами по себе
// экрану не нужны, только порядок вопросов внутри них (тот же снимок, что
// в кабинете, web/src/attempt/AttemptBlock.tsx, только по одному вопросу,
// не всей формой сразу). Чистая логика без Mongo и без сети.
import {
  ATTEMPT_EXPIRED_MESSAGE,
  ATTEMPT_NOT_IN_PROGRESS_MESSAGE,
  formatOptionLabel,
  type AttemptAnswerDto,
  type AttemptQuestionDto,
  type ExamAttemptDto,
} from '@xuanxue/shared';
import type { InlineKeyboardButton } from 'telegraf/types';
import { inlineButton } from '../callback-data';
import { backToMenuButton, type BotMenu } from './bot-menu';
import { buildOptionId, buildQuestionId } from './exam-callback-ids';

// Вопросы text/video отвечаются прямо здесь (ТЗ 4б.2 часть 2): подсказка на
// экране — вся инструкция, кнопки не нужно, ждём просто следующее сообщение
// в чат. Ожидание ответа ставит exam-question-render.ts при каждом показе
// этого экрана (bot-session.service.ts, kind 'examText'/'examMedia' с
// номером вопроса) — сам экран, как и раньше, чистая функция без Mongo.
// Кабинет остаётся запасным путём (ADR-0024): у видео там же добавляется
// ссылка или ручная отметка учителя (ADR-0023) — это не первое, что видит
// ученик, но никуда не делось.
const TEXT_QUESTION_PROMPT = 'Напишите ответ сообщением — обычным текстом, прямо сюда.';
const VIDEO_QUESTION_PROMPT =
  'Снимите или пришлите видео сюда — видеосообщение, «кружок» или файл с видео.';
// Замены нет: второе видео ложится рядом с первым (media-asset.schema.ts —
// у kind 'telegram' уникального индекса нет сознательно), учитель видит оба.
const VIDEO_RECEIVED_NOTE = 'Видео получено. Пришлёте ещё — учитель увидит оба.';

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
      `${optionMark(question.kind, selectedIds.has(option.id))}${formatOptionLabel(option.text, optionIndex)}`,
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

/** `answer`/`hasVideo` отражают уже сохранённое: у текста — эхо ответа (новое
 * сообщение его заменит), у видео — «видео получено» вместо повторной просьбы
 * прислать. Замены у видео нет, см. VIDEO_RECEIVED_NOTE. */
function questionNote(
  question: AttemptQuestionDto,
  answer: AttemptAnswerDto | undefined,
  hasVideo: boolean,
): string | null {
  if (question.kind === 'text') {
    return answer?.text
      ? `Ваш ответ: «${answer.text}»\n\nПришлите новый — заменит этот.`
      : TEXT_QUESTION_PROMPT;
  }
  if (question.kind === 'video')
    return hasVideo ? VIDEO_RECEIVED_NOTE : VIDEO_QUESTION_PROMPT;
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
  // itemId — из самого вопроса (ADR-0037), не «есть хоть какое-то видео у
  // попытки»: два video-вопроса в одной форме теперь различимы.
  const hasVideo = (attempt.media ?? []).some((m) => m.itemId === question.itemId);
  const note = questionNote(question, answer, hasVideo);
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
