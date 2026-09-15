// Строка метаданных под названием формы в списке («12 вопросов · 3 блока ·
// 2 попытки · 40 минут», ТЗ 4.3 «Список») — чистый форматтер с тестом,
// включая пустую форму (CLAUDE.md «Продуктовая фича = число в своём
// разделе»: на пустых данных — честное «Пока без блоков», не «0 блоков»).
// Статус в строку не входит — направление «тихо и благородно» (docs/adr/
// 0031) показывает его отдельной меткой справа (ExamCard.tsx,
// .xuanxue-status-label), а не текстом в общей строке. pluralRu — общий
// примитив склонения (shared/src/plural-ru.ts), по образцу
// schedule/channelCountLabel.ts.
import { formatDurationRu, pluralRu, type ExamDto } from '@xuanxue/shared';

const BLOCK_FORMS = { one: 'блок', few: 'блока', many: 'блоков', other: 'блока' };
const QUESTION_FORMS = {
  one: 'вопрос',
  few: 'вопроса',
  many: 'вопросов',
  other: 'вопроса',
};
const ATTEMPT_FORMS = {
  one: 'попытка',
  few: 'попытки',
  many: 'попыток',
  other: 'попытки',
};

const NO_BLOCKS_TEXT = 'Пока без блоков';
const NO_TIME_LIMIT_TEXT = 'без ограничения';

export function countQuestions(blocks: ExamDto['blocks']): number {
  return blocks.reduce((sum, block) => sum + block.itemIds.length, 0);
}

/** Строка метаданных карточки формы: вопросы и блоки (если блоки уже есть),
 * число попыток, лимит времени — куски, разделённые « · ». */
export function formatExamListMeta(
  exam: Pick<ExamDto, 'blocks' | 'attemptsAllowed' | 'timeLimitMin'>,
): string {
  const segments: string[] = [];
  if (exam.blocks.length === 0) {
    segments.push(NO_BLOCKS_TEXT);
  } else {
    const questions = countQuestions(exam.blocks);
    segments.push(`${questions} ${pluralRu(questions, QUESTION_FORMS)}`);
    segments.push(`${exam.blocks.length} ${pluralRu(exam.blocks.length, BLOCK_FORMS)}`);
  }
  segments.push(
    `${exam.attemptsAllowed} ${pluralRu(exam.attemptsAllowed, ATTEMPT_FORMS)}`,
  );
  segments.push(
    exam.timeLimitMin ? formatDurationRu(exam.timeLimitMin) : NO_TIME_LIMIT_TEXT,
  );
  return segments.join(' · ');
}
