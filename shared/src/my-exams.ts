// Кабинет ученика: что он видит про свои экзамены (`GET /me/exams`, слой 4.1
// API, docs/PLAN.md §11). Отдельным файлом, потому что exams.ts упёрся в
// лимит размера (CLAUDE.md «Храповики»); здесь только взгляд ученика на свои
// попытки — форма живёт в exams.ts, снимок попытки — в exam-attempts.ts,
// итог проверки — в exam-grading.ts.
import type {
  AttemptAnswerDto,
  ExamAttemptDto,
  ExamAttemptStatus,
} from './exam-attempts';
import type { GradingOutcome } from './exam-grading';

// Экран ученика (`/me/exams`, docs/PLAN.md §11 слой 4.1 API) — опубликованные
// формы и положение самого ученика по каждой: сколько попыток он уже начал и
// что с последней (её `id`, чтобы экран мог открыть «продолжить»/посмотреть
// сдачу). Не ExamDto — ученику до старта попытки не нужны блоки формы
// (вопросы открывает `/exams/:id/attempts`, слой 4.4), только положение.

/** Положение по последней попытке — только то, что нужно экрану ученика:
 * открыть её (`id`), понять, что с ней (`status`), и увидеть итог с
 * комментарием учителя, если оценка уже выставлена (слой 4.6). `outcome`/
 * `comment` — только из своей оценки: ученик не видит ни оценок другого
 * ученика, ни критериев проверки вопроса (`ExamItemDto.criteria`) — итог
 * качественный, без баллов (PLAN §11 «Границы»). */
interface MyExamAttemptSummaryDto {
  id: string;
  status: ExamAttemptStatus;
  /** Попытку закрыло время, а не сам ученик. Разные вещи для того, что
   * предложить дальше: после дедлайна человек не «обходит проверку», он её
   * не успел пройти (решение владельца 2026-09-21). */
  expired: boolean;
  /** Когда попытку закроет время — ISO 8601 UTC, абсолютный момент
   * (`startedAt + timeLimitMin`, exam-attempt-start.ts). Только у попытки
   * `in_progress`: у закрытой время уже ничего не отсчитывает, и старая
   * отметка в записи читалась бы как живой дедлайн (MyExamsService). Нет
   * поля и у формы без лимита времени. Пауз нет: время идёт, пока ученик
   * вышел, поэтому остаток он должен видеть на списке, а не только внутри
   * самой попытки (ADR-0122, describeExamTime в exam-time.ts). */
  deadlineAt?: string;
  outcome?: GradingOutcome;
  comment?: string;
}

export interface MyExamDto {
  id: string;
  title: string;
  description: string;
  level: string;
  attemptsAllowed: number;
  /** Сколько попыток этот ученик уже начал по этой форме (включая
   * незаконченные) — не «сколько осталось»: экран сам сравнит с
   * `attemptsAllowed`, а форма ответа за вычитание не отвечает. */
  attemptsUsed: number;
  /** Сколько времени даётся на одну попытку. Нет поля — форма без лимита,
   * и про время экран не говорит ничего (ADR-0122). Не срок сдачи — тот
   * ниже, отдельным полем. */
  timeLimitMin?: number;
  /** Срок сдачи — начать НОВУЮ попытку можно только до этого момента
   * (ADR-0124, isExamDuePassed в exam-time.ts). Нет поля — срока нет. Уже
   * идущую попытку срок не закрывает — у неё свой дедлайн, deadlineAt. */
  dueAt?: string;
  /** Отсутствует, если ученик ещё не начинал попытку по этой форме. */
  lastAttempt?: MyExamAttemptSummaryDto;
}

export interface ListMyExamsQuery {
  limit?: number;
}

export type MyExamAction = 'continue' | 'start' | 'retry' | null;

/** Сколько попыток ещё можно начать — не «сколько уже потрачено»: кабинет и
 * бот сравнивают именно остаток с нулём, вычитание не дублируется в каждом
 * месте (переезжает из web/src/student/examAttemptState.ts, тот же
 * комментарий). Не в минус: учитель мог уменьшить лимит формы уже после
 * того, как ученик прошёл её несколько раз по старому лимиту. */
export function myExamAttemptsLeft(exam: MyExamDto): number {
  return Math.max(0, exam.attemptsAllowed - exam.attemptsUsed);
}

/** Одна кнопка по смыслу — что кабинету и боту предложить ученику дальше по
 * его последней попытке. `continue` — она ещё открыта, `start` — попытки не
 * было вовсе, `retry` — можно начать заново, `null` — нажимать нечего,
 * причину экран объясняет текстом сам (кабинет и бот — разными словами).
 *
 * Единственная функция на два экрана (CLAUDE.md «Одна механика — один
 * компонент»): до 2026-09-21 кабинет и бот решали это каждый по-своему, и
 * бот пускал на новую попытку любую сданную работу, включая ещё не
 * проверенную, — то самое «обход проверки», которое кабинет как раз
 * запрещал. Решение владельца 2026-09-21 провело границу по `expired`, не
 * по `status` в одиночку: `submitted` без `expired` — ученик сдал сам и
 * ждёт итога, вторая попытка тут была бы попыткой получить другую оценку за
 * ту же работу; `submitted` с `expired: true` — ученика прервало время, а
 * не проверка, и ждать ему нечего. `graded` — учитель уже посмотрел и мог
 * попросить доработать, поэтому разрешён независимо от `expired`.
 *
 * `attemptsUsed < attemptsAllowed` на сервере (`ExamAttemptsService.start`)
 * не тронуто и не должно: лимит попыток остаётся настоящей защитой, эта
 * функция только решает, что ПРЕДЛОЖИТЬ нажать, не что РАЗРЕШЕНО серверу
 * (ADR-0091). */
export function getMyExamAction(exam: MyExamDto): MyExamAction {
  if (exam.lastAttempt?.status === 'in_progress') return 'continue';
  if (myExamAttemptsLeft(exam) <= 0) return null;
  if (!exam.lastAttempt) return 'start';
  if (exam.lastAttempt.status === 'graded') return 'retry';
  if (exam.lastAttempt.status === 'submitted' && exam.lastAttempt.expired) return 'retry';
  return null;
}

function hasTextOrOptionAnswer(answer: AttemptAnswerDto | undefined): boolean {
  if (!answer) return false;
  return (answer.optionIds?.length ?? 0) > 0 || Boolean(answer.text?.trim());
}

/** Первый вопрос попытки, на который ещё нет ответа — куда боту открывать
 * «Продолжить» (отзыв владельца 2026-09-22, ADR-0119: кабинет показывает всю
 * форму на одной странице, а бот — по вопросу на экран, поэтому ему нужно
 * знать, с какого начать). Все отвечены — последний, а не первый: нечего
 * листать заново. Пустой снимок — вырожденный случай (0), сюда попадать не
 * должен.
 *
 * Правило «отвечен ли вопрос» — то же, что у сервера (answered в
 * api/src/exams/exam-attempt-review.ts) и у кабинета
 * (web/src/attempt/attemptUnanswered.ts): выбран вариант или в тексте есть
 * не только пробелы; видео-вопрос отвечает записью в `media`, а не строкой
 * в `answers` (ADR-0037). Третьей реализации этого правила не заводим — она
 * здесь, рядом с getMyExamAction (CLAUDE.md «Одна механика — один
 * компонент», прецедент ADR-0091: кабинет и бот однажды уже разъехались,
 * посчитав каждый по-своему). */
export function firstUnansweredQuestionIndex(
  attempt: Pick<ExamAttemptDto, 'blocks' | 'answers' | 'media'>,
): number {
  const questions = attempt.blocks.flatMap((block) => block.questions);
  if (questions.length === 0) return 0;
  const answerByItemId = new Map(
    attempt.answers.map((answer) => [answer.itemId, answer]),
  );
  const media = attempt.media ?? [];
  const index = questions.findIndex((question) =>
    question.kind === 'video'
      ? !media.some((item) => item.itemId === question.itemId)
      : !hasTextOrOptionAnswer(answerByItemId.get(question.itemId)),
  );
  return index === -1 ? questions.length - 1 : index;
}
