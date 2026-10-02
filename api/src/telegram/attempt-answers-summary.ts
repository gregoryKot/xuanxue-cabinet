// Построчная сводка ответов ученика для карточки проверки в боте (слой 4б.5,
// PLAN §12) — источник данных та же карточка `GET /attempts/:id/review`
// (buildReviewBlocks, exam-attempt-review.ts), не вторая сборка: сюда
// приходит уже готовый AttemptReviewDto (через ExamBotPort.loadAttemptReview,
// attempt-submitted-message.ts). Автопроверенные варианты — «верно k из n»
// (та же автопроверка, что в кабинете, не второй счёт); текст — как есть с
// честной обрезкой («полностью — в кабинете»); видео из бота — только факт
// получения, не «уже переслано в этот чат»: пересылка при получении —
// best-effort (ADR-0095, exam-media-forward.ts), карточка проверки достаёт
// видео заново в любой момент. Чистая логика, без Mongo и без сети
// (CLAUDE.md «Тесты»).
import {
  ATTEMPT_NO_ANSWER_TEXT,
  BROADCAST_LIMITS,
  type AttemptReviewBlockDto,
  type AttemptReviewQuestionDto,
  type ExamMediaDto,
} from '@xuanxue/shared';

const ANSWER_PREVIEW_LENGTH = 200;
const SEPARATOR = '\n\n';

/** Потолок одного сообщения Telegram — тот же, что у текста рассылки
 * (BROADCAST_LIMITS.text). Сводка длиннее него Telegram отвергает целиком:
 * «Форма 1» на 56 вопросов давала 4087–4279 знаков, и учитель не получал
 * «работу сдали» вовсе (аудит 2026-10-01, F31). */
export const TELEGRAM_MESSAGE_MAX_LENGTH = BROADCAST_LIMITS.text;

function restNote(rest: number): string {
  return `Остальные ответы (ещё ${rest}) — в кабинете.`;
}

function summarizeChoice(question: AttemptReviewQuestionDto): string {
  if (!question.optionsCheck) return ATTEMPT_NO_ANSWER_TEXT;
  const { correctSelectedCount, correctTotalCount, incorrectSelectedCount } =
    question.optionsCheck;
  const extra =
    incorrectSelectedCount > 0 ? `, лишних выбрано ${incorrectSelectedCount}` : '';
  return `Верно ${correctSelectedCount} из ${correctTotalCount}${extra}.`;
}

// Ссылка на кабинет здесь не печатается: при нескольких длинных ответах в
// одной попытке она повторялась бы столько же раз, а в подвале сообщения
// (attempt-submitted-message.ts) она и так стоит один раз.
function summarizeText(question: AttemptReviewQuestionDto): string {
  const text = question.answerText?.trim();
  if (!text) return ATTEMPT_NO_ANSWER_TEXT;
  if (text.length <= ANSWER_PREVIEW_LENGTH) return text;
  return `${text.slice(0, ANSWER_PREVIEW_LENGTH)}… Полностью — в кабинете.`;
}

function summarizeVideo(media: readonly ExamMediaDto[]): string {
  if (media.length === 0) return 'Видео не получено.';
  // Несколько записей на один вопрос — учитель мог прислать видео дважды;
  // последняя по порядку и есть та, что учитель отмечал позже других.
  const last = media[media.length - 1] as ExamMediaDto;
  // ADR-0095: пересылка при получении — best-effort, могла не дойти (бота
  // ещё не подключили, вид уведомления выключен) — не утверждаем, что видео
  // точно в этом чате; кнопка на карточке проверки достаёт его заново.
  if (last.kind === 'telegram') return 'Видео получено.';
  if (last.kind === 'link') return `Видео по ссылке: ${last.url}`;
  // ADR-0137: файл в R2 — открывается только в кабинете (ссылки в боте нет,
  // сессия ученика туда не долетает).
  if (last.kind === 'file') return 'Видео-файл — в кабинете.';
  return last.note
    ? `Отмечено вручную: ${last.note}`
    : 'Отмечено вручную, без комментария.';
}

function mediaByItem(media: readonly ExamMediaDto[]): Map<string, ExamMediaDto[]> {
  const map = new Map<string, ExamMediaDto[]>();
  for (const item of media) {
    if (!item.itemId) continue; // видео-«сирота» без вопроса (деплой на стыке) — сюда не попадает
    const list = map.get(item.itemId) ?? [];
    list.push(item);
    map.set(item.itemId, list);
  }
  return map;
}

function summarizeQuestion(
  question: AttemptReviewQuestionDto,
  media: Map<string, ExamMediaDto[]>,
): string {
  if (question.kind === 'video') {
    return summarizeVideo(media.get(question.itemId) ?? []);
  }
  if (question.options.length > 0) return summarizeChoice(question);
  return summarizeText(question);
}

/** `maxLength` — сколько знаков отведено сводке внутри сообщения (вызывающий
 * вычитает шапку и подвал, attempt-submitted-message.ts). Не влезает —
 * первые вопросы целиком и честная строка про остальные, не обрыв на
 * полуслове и не молчание. */
export function attemptAnswersSummary(
  blocks: readonly AttemptReviewBlockDto[],
  media: readonly ExamMediaDto[],
  maxLength = Number.POSITIVE_INFINITY,
): string {
  const byItem = mediaByItem(media);
  const questions = blocks.flatMap((block) => block.questions);
  const lines = questions.map(
    (question, index) =>
      `${index + 1}. ${question.prompt}\n${summarizeQuestion(question, byItem)}`,
  );
  const parts: string[] = [];
  for (const [index, line] of lines.entries()) {
    const rest = lines.length - index - 1;
    const tail = rest > 0 ? [restNote(rest)] : [];
    const length = [...parts, line, ...tail].join(SEPARATOR).length;
    if (length > maxLength) return [...parts, restNote(rest + 1)].join(SEPARATOR);
    parts.push(line);
  }
  return parts.join(SEPARATOR);
}
