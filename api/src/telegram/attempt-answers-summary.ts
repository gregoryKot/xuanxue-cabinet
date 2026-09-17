// Построчная сводка ответов ученика для карточки проверки в боте (слой 4б.5,
// PLAN §12) — источник данных та же карточка `GET /attempts/:id/review`
// (buildReviewBlocks, exam-attempt-review.ts), не вторая сборка: сюда
// приходит уже готовый AttemptReviewDto (через ExamBotPort.loadAttemptReview,
// attempt-submitted-message.ts). Автопроверенные варианты — «верно k из n»
// (та же автопроверка, что в кабинете, не второй счёт); текст — как есть с
// честной обрезкой («полностью — в кабинете»); видео — что получено и где
// смотреть (оно уже переслано учителю в тот же чат при получении,
// exam-media-forward.ts — здесь напоминание, не вторая пересылка). Чистая
// логика, без Mongo и без сети (CLAUDE.md «Тесты»).
import type {
  AttemptReviewBlockDto,
  AttemptReviewQuestionDto,
  ExamMediaDto,
} from '@xuanxue/shared';

const ANSWER_PREVIEW_LENGTH = 200;
const NO_ANSWER_TEXT = 'Ответа нет.';

function summarizeChoice(question: AttemptReviewQuestionDto): string {
  if (!question.optionsCheck) return NO_ANSWER_TEXT;
  const { correctSelectedCount, correctTotalCount, incorrectSelectedCount } =
    question.optionsCheck;
  const extra =
    incorrectSelectedCount > 0 ? `, лишних выбрано ${incorrectSelectedCount}` : '';
  return `Верно ${correctSelectedCount} из ${correctTotalCount}${extra}.`;
}

function summarizeText(question: AttemptReviewQuestionDto, gradingLink?: string): string {
  const text = question.answerText?.trim();
  if (!text) return NO_ANSWER_TEXT;
  if (text.length <= ANSWER_PREVIEW_LENGTH) return text;
  const suffix = gradingLink
    ? `… Полностью — в кабинете: ${gradingLink}`
    : '… Полностью — в кабинете.';
  return `${text.slice(0, ANSWER_PREVIEW_LENGTH)}${suffix}`;
}

function summarizeVideo(media: readonly ExamMediaDto[]): string {
  if (media.length === 0) return 'Видео не получено.';
  // Несколько записей на один вопрос — учитель мог прислать видео дважды;
  // последняя по порядку и есть та, что учитель отмечал позже других.
  const last = media[media.length - 1] as ExamMediaDto;
  if (last.kind === 'telegram') return 'Видео получено — переслано вам в этом чате.';
  if (last.kind === 'link') return `Видео по ссылке: ${last.url}`;
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
  gradingLink?: string,
): string {
  if (question.kind === 'video') {
    return summarizeVideo(media.get(question.itemId) ?? []);
  }
  if (question.options.length > 0) return summarizeChoice(question);
  return summarizeText(question, gradingLink);
}

export function attemptAnswersSummary(
  blocks: readonly AttemptReviewBlockDto[],
  media: readonly ExamMediaDto[],
  gradingLink?: string,
): string {
  const byItem = mediaByItem(media);
  const questions = blocks.flatMap((block) => block.questions);
  const lines = questions.map(
    (question, index) =>
      `${index + 1}. ${question.prompt}\n${summarizeQuestion(question, byItem, gradingLink)}`,
  );
  return lines.join('\n\n');
}
