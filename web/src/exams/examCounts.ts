// Строка метаданных под названием экзамена в списке («12 вопросов ·
// 2 попытки · 40 минут», ТЗ 4.3 «Список») — чистый форматтер с тестом,
// включая пустой экзамен (CLAUDE.md «Продуктовая фича = число в своём
// разделе»: на пустых данных — честное «Пока без вопросов», не «0 вопросов»).
// Числа блоков в строке больше нет: для учителя экзамен — один список
// вопросов (ADR-0033).
// Статус в строку не входит — показывает его отдельной меткой справа
// (ExamCard.tsx, макет 2b-exams.html, docs/adr/0043), а не текстом в общей
// строке. pluralRu — общий
// примитив склонения (shared/src/plural-ru.ts), по образцу
// schedule/channelCountLabel.ts.
import { formatDurationRu, pluralRu, type ExamDto } from '@xuanxue/shared';

// Экспортирован: examFormInput.ts (валидация «Вопросов ученику») использует
// то же склонение, дублировать формы — jscpd-храповик (CLAUDE.md «Дубли»).
export const QUESTION_FORMS = {
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

const NO_QUESTIONS_TEXT = 'Пока без вопросов';
const NO_TIME_LIMIT_TEXT = 'без ограничения';

export function countQuestions(blocks: ExamDto['blocks']): number {
  return blocks.reduce((sum, block) => sum + block.itemIds.length, 0);
}

/** Экзамен для учителя — один список (ADR-0033), поле у блока одно и то же
 * значение при слиянии старой многоблочной формы не подразумевается — берём
 * первый блок, у которого оно задано; `undefined`, если ни у одного блока
 * поля нет (ADR-0080: сдающий получает все вопросы). */
export function countQuestionsPerAttempt(blocks: ExamDto['blocks']): number | undefined {
  return blocks.find((block) => block.questionsPerAttempt !== undefined)
    ?.questionsPerAttempt;
}

/** Строка метаданных строки списка: число вопросов (если они уже есть) — с
 * учётом случайной выборки (ADR-0080), число попыток, лимит времени — куски,
 * разделённые « · ». */
export function formatExamListMeta(
  exam: Pick<ExamDto, 'blocks' | 'attemptsAllowed' | 'timeLimitMin'>,
): string {
  const questions = countQuestions(exam.blocks);
  const perAttempt = countQuestionsPerAttempt(exam.blocks);
  const questionsLabel =
    perAttempt !== undefined ? `${perAttempt} из ${questions}` : `${questions}`;
  const segments: string[] = [
    questions === 0
      ? NO_QUESTIONS_TEXT
      : `${questionsLabel} ${pluralRu(questions, QUESTION_FORMS)}`,
  ];
  segments.push(
    `${exam.attemptsAllowed} ${pluralRu(exam.attemptsAllowed, ATTEMPT_FORMS)}`,
  );
  segments.push(
    exam.timeLimitMin ? formatDurationRu(exam.timeLimitMin) : NO_TIME_LIMIT_TEXT,
  );
  return segments.join(' · ');
}
