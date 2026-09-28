// Объяснение выбранного варианта (ADR-0146, ТЗ 4.4 доп.) — чистые функции без
// похода в базу: проверяет и сервис попытки (submit — отказ при пропуске), и
// экран бота (что написать над полем). Отдельным файлом от exam-attempts.ts —
// тот файл и так близок к лимиту размера (CLAUDE.md «Храповики»), а это не
// про снимок попытки, а про одно правило поверх него.
import type { AttemptAnswerDto, AttemptQuestionDto } from './exam-attempts';

/** Подпись required-поля объяснения над строкой выбора варианта. */
export const ATTEMPT_REASON_LABEL = 'Объясните свой ответ';

/** Вопрос из снимка попытки — веб и бот несут его в разных типах
 * (AttemptQuestionDto на клиенте, AttemptBlockRecord/AttemptQuestionRecord в
 * api), поэтому тип структурный: подходит любой объект с этими полями. */
type ReasonQuestion = Pick<AttemptQuestionDto, 'itemId' | 'askReason' | 'kind'>;

/**
 * Правило ADR-0146: объяснение обязательно, только если вопрос его просит,
 * это вопрос с выбором варианта, и ученик хотя бы один вариант выбрал —
 * пропустить вопрос целиком по-прежнему можно (CLAUDE.md «Ноль нагрузки на
 * ученика»), но выбрав ответ, объяснение уже не пропустить.
 */
export function isReasonMissing(
  question: ReasonQuestion,
  answer: AttemptAnswerDto | undefined,
): boolean {
  if (!question.askReason) return false;
  if (question.kind !== 'single' && question.kind !== 'multiple') return false;
  const hasOption = (answer?.optionIds ?? []).length > 0;
  if (!hasOption) return false;
  return !answer?.text?.trim();
}

/** Блок снимка — веб и бот несут вопросы либо плоским списком, либо
 * блоками; функция ниже принимает и то и другое (см. `findMissingReasonNumbers`). */
interface ReasonBlock {
  questions: readonly ReasonQuestion[];
}

/**
 * 1-based номера вопросов (сквозной порядок по блокам, как в экране бота
 * «Вопрос N из M»), у которых объяснение обязательно, но не написано.
 * Принимает уже готовый плоский список вопросов ИЛИ блоки — оба источника
 * в api/web устроены по-разному, отдельного маппинга под каждого вызывающего
 * заводить незачем (CLAUDE.md «Одна механика — один компонент»).
 */
export function findMissingReasonNumbers(
  entries: readonly (ReasonQuestion | ReasonBlock)[],
  answers: readonly AttemptAnswerDto[],
): number[] {
  const flat: ReasonQuestion[] = entries.flatMap((entry) =>
    'questions' in entry ? entry.questions : [entry],
  );
  const answerByItemId = new Map(
    answers.map((answer) => [answer.itemId, answer] as const),
  );
  return flat
    .map((question, index) => ({ question, index }))
    .filter(({ question }) =>
      isReasonMissing(question, answerByItemId.get(question.itemId)),
    )
    .map(({ index }) => index + 1);
}

/**
 * Текст отказа при попытке сдать работу с пропущенным объяснением — «вы»,
 * с действием (docs/VOICE.md). Без `**` — строка уходит и в Telegram
 * (check-text-accents.mjs запрещает непарный маркер в web/src, а в
 * api/src/shared/src маркер и вовсе падает сразу).
 */
export function formatMissingReasonMessage(numbers: readonly number[]): string {
  const word = numbers.length === 1 ? 'вопросе' : 'вопросах';
  const list = numbers.join(', ');
  return `Объясните свой ответ в ${word} ${list} — без объяснения работу не отправить.`;
}
