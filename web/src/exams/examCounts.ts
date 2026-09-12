// Подсчёт блоков/вопросов для карточки формы (ТЗ 4.3 «Список»: «сколько
// блоков и вопросов всего») — чистый форматтер с тестом, включая пустую форму
// (CLAUDE.md «Продуктовая фича = число в „Сводке“»: на пустых данных — честное
// «без блоков», не «0 блоков»). pluralRu — общий примитив склонения
// (shared/src/plural-ru.ts), по образцу schedule/channelCountLabel.ts.
import { pluralRu, type ExamBlockDto } from '@xuanxue/shared';

const BLOCK_FORMS = { one: 'блок', few: 'блока', many: 'блоков', other: 'блока' };
const QUESTION_FORMS = {
  one: 'вопрос',
  few: 'вопроса',
  many: 'вопросов',
  other: 'вопроса',
};

export function countQuestions(blocks: ExamBlockDto[]): number {
  return blocks.reduce((sum, block) => sum + block.itemIds.length, 0);
}

export function formatExamContentSummary(blocks: ExamBlockDto[]): string {
  if (blocks.length === 0) return 'Пока без блоков';
  const questions = countQuestions(blocks);
  return (
    `${blocks.length} ${pluralRu(blocks.length, BLOCK_FORMS)} · ` +
    `${questions} ${pluralRu(questions, QUESTION_FORMS)}`
  );
}
