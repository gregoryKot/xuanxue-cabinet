// Экран «Вопрос N из M» — один вопрос попытки на сообщение (ТЗ 4б.2, ADR-0024, PLAN.md
// §12). Вопросы читаются из снимка попытки (ExamAttemptDto.blocks) по сквозному порядку —
// блоки формы сами по себе экрану не нужны, только порядок вопросов внутри них (тот же
// снимок, что в кабинете, web/src/attempt/AttemptBlock.tsx). Чистая логика без Mongo и без сети.
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
import { buildReasonNote } from './exam-question-reason-note';

// Вопросы text/video (и объяснение у askReason, ADR-0146) отвечаются прямо здесь (ТЗ
// 4б.2 часть 2): подсказка на экране — вся инструкция, ждём следующее сообщение в чат.
// Ожидание ставит exam-question-render.ts при каждом показе экрана (kind
// 'examText'/'examMedia', bot-session.service.ts). Кабинет — запасной путь (ADR-0024).
const TEXT_QUESTION_PROMPT = 'Напишите ответ сообщением — обычным текстом, прямо сюда.';
// Экспортирован — exam-media-deep-link.ts зовёт тем же текстом (CLAUDE.md «Дубли»).
export const VIDEO_QUESTION_PROMPT =
  'Снимите или пришлите видео сюда — видеосообщение, «кружок» или файл с видео.';
// Замены нет: attachTelegramVideo всегда вставляет новую запись — у kind:
// 'telegram' уникального индекса нет сознательно, старая остаётся видна учителю.
const VIDEO_RECEIVED_NOTE = 'Видео получено.';

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

// Ссылочное видео вопроса/варианта (ADR-0133) — не путать с ответом
// video-вопроса (VIDEO_QUESTION_PROMPT/VIDEO_RECEIVED_NOTE ниже, ADR-0023):
// то видео присылает сам ученик, это — учитель прикладывает к формулировке
// или варианту как материал для сравнения («что не так на этом видео»,
// «который из двух верный»). 2026-09-27, «Уточнено» ADR-0133: бот теперь
// присылает сам ролик (файл — отдельным sendVideo, ссылка — отдельным
// сообщением с превью, exam-question-video-send.ts) прямо перед этим
// экраном, текст вопроса больше не повторяет ссылку и не пишет заранее, что
// видео «есть в кабинете» — это было бы то же самое дважды. Отметка нужна
// только когда клип R2 показать не удалось (R2 выключен, объект пропал) —
// её ставит presentAttemptScreen (exam-question-render.ts) по результату
// отправки, не эта чистая функция.
export const ITEM_VIDEO_IN_CABINET_NOTE = 'К вопросу есть видео — оно в кабинете.';

function hasReferenceVideo(entity: { videoId?: string; videoUrl?: string }): boolean {
  return Boolean(entity.videoId || entity.videoUrl);
}

// Подпись фото/видео ученику видна в ленте, сетка альбома — нет (ADR-0118):
// номер на кнопке — единственная связь медиа с кнопкой, когда у варианта
// есть текст (он в подписи фото ещё и обрезан до 100 знаков). Видео-вариант
// (ADR-0133) сюда же — фото бот шлёт альбомом, видео нет, но кнопка со своим
// номером нужна ученику ровно по той же причине.
function optionButtons(
  attemptId: string,
  index: number,
  question: AttemptQuestionDto,
  answer: AttemptAnswerDto | undefined,
): InlineKeyboardButton[][] {
  const selectedIds = new Set(answer?.optionIds ?? []);
  const numbered = question.options.some(
    (option) => option.imageId || hasReferenceVideo(option),
  );
  return question.options.map((option, optionIndex) => [
    inlineButton(
      `${optionMark(question.kind, selectedIds.has(option.id))}${numbered ? `${optionIndex + 1}. ` : ''}${formatOptionLabel(option.text, optionIndex)}`,
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

/** `answer`/`hasVideo` отражают уже сохранённое — эхо своего текста, чтобы
 * было видно, что ответ принят (и что новое сообщение его заменит), «видео
 * получено» вместо повторной просьбы прислать. */
function questionNote(
  question: AttemptQuestionDto,
  answer: AttemptAnswerDto | undefined,
  hasVideo: boolean,
): string | null {
  if (question.kind === 'text') {
    return answer?.text
      ? `Ваш ответ: «${answer.text}» — пришлите новый, если хотите заменить.`
      : TEXT_QUESTION_PROMPT;
  }
  if (question.kind === 'video')
    return hasVideo ? VIDEO_RECEIVED_NOTE : VIDEO_QUESTION_PROMPT;
  if (question.askReason) return buildReasonNote(answer);
  return null;
}

/** Экран вопроса попытки, ещё «в работе». Индекс вне снимка (защита в глубину — устаревшая
 * кнопка, попытка пересобрана) — честный откат к «попытка не найдена» оставляем
 * вызывающему коду, здесь просто пустой экран без кнопок, ничего не рендерим как вопрос. */
export function buildQuestionScreen(attempt: ExamAttemptDto, index: number): BotMenu {
  const questions = flattenAttemptQuestions(attempt);
  const question = questions[index];
  if (!question) return { text: attempt.examTitle, buttons: [backToMenuButton()] };

  const answer = findAnswer(attempt.answers, question.itemId);
  const headerLine = `Вопрос ${index + 1} из ${questions.length}`;
  // itemId — из самого вопроса (ADR-0037), не «есть хоть какое-то видео у
  // попытки»: два video-вопроса в одной форме теперь различимы.
  const hasVideo = (attempt.media ?? []).some((m) => m.itemId === question.itemId);
  const note = questionNote(question, answer, hasVideo);
  const text = [headerLine, question.prompt, note].filter(Boolean).join('\n\n');

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
 * (`justSubmitted`), сдана раньше или закрыта по дедлайну — тексты те же, что уже
 * показывает кабинет (ATTEMPT_EXPIRED_MESSAGE/ATTEMPT_NOT_IN_PROGRESS_MESSAGE,
 * shared/src/exam-attempts.ts), не второй текст той же мысли. */
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
