// Попытка сдачи экзамена: DTO и константы API попытки (`/exams/:id/attempts`,
// `/attempts`, слой 4.4). Отдельным файлом, потому что exams.ts упёрся в
// лимит размера (CLAUDE.md «Храповики») — не потому что так красивее: форма
// экзамена (вопросы, блоки, лимиты формы) осталась в exams.ts, здесь только
// попытка сдачи.
//
// EXAM_NOT_PUBLISHED_MESSAGE лежит здесь, а не в exams.ts: текст говорит
// о форме («экзамен ещё не открыт»), но само правило — про старт попытки
// (ТЗ 4.4, п.1), и используется оно только кодом попытки
// (exam-attempts.service.ts и обработчиками бота) — форма сама по себе это
// сообщение не показывает.

import type { GradingOutcome } from './exam-grading';
import type { ExamItemKind } from './exam-items';
import type { ExamMediaDto } from './exam-media';

// Попытка сдачи экзамена (`/exams/:id/attempts`, `/attempts`, слой 4.4,
// docs/PLAN.md §11, ADR-0022 + дополнение 2026-09-12). В момент старта
// попытка сохраняет снимок формы — блоки, вопросы в редакции и порядке на
// момент старта — и дальше живёт им, не бланком. Снимок хранит и правильные
// ответы («correct» у вариантов), и критерии проверки: они понадобятся при
// проверке (слой 4.6), а взять их потом из вопроса нельзя — его могли
// переписать. Но ученику они не уходят — DTO ниже устроены соответственно:
// `AttemptOptionDto`/`AttemptQuestionDto` не несут ни `correct`, ни
// `criteria`, в отличие от `ExamItemOptionDto`/`ExamItemDto` выше.

export const EXAM_ATTEMPT_STATUSES = ['in_progress', 'submitted', 'graded'] as const;
export type ExamAttemptStatus = (typeof EXAM_ATTEMPT_STATUSES)[number];

/** Вариант в снимке — как его видит ученик: без отметки «верный».
 * `imageId` — картинка варианта (ADR-0035): ученику она доступна по
 * `GET /exam-images/:id` ровно потому, что стоит в снимке его попытки. */
export interface AttemptOptionDto {
  id: string;
  text: string;
  imageId?: string;
}

export interface AttemptQuestionDto {
  itemId: string;
  version: number;
  kind: ExamItemKind;
  prompt: string;
  hint?: string;
  options: AttemptOptionDto[];
}

export interface AttemptBlockDto {
  id: string;
  title: string;
  questions: AttemptQuestionDto[];
}

export interface AttemptAnswerDto {
  itemId: string;
  text?: string;
  optionIds?: string[];
}

export interface ExamAttemptDto {
  id: string;
  examId: string;
  examTitle: string;
  userId: string;
  /** Только сотруднику школы (учитель, помощник, админ): в очереди проверки
   * нужно видеть, чью работу открываешь. Ученику не приходит — своя попытка
   * и так подписана экзаменом. */
  userName?: string;
  status: ExamAttemptStatus;
  blocks: AttemptBlockDto[];
  answers: AttemptAnswerDto[];
  startedAt: string; // ISO UTC с Z
  /** Есть, только если у формы стоит лимит времени. */
  deadlineAt?: string;
  submittedAt?: string;
  /** Сдано не человеком, а временем. */
  expired: boolean;
  /** Видео экзамена (ADR-0023) — опционально ради текущих web-фикстур. */
  media?: ExamMediaDto[];
  /** Итог и когда проверено (слой 4.6) — только сотруднику школы и только у
   * уже проверенной попытки, тем же приёмом и по той же причине, что
   * `userName` выше: свой итог ученик видит на «Заданиях» (`GET /me/exams`),
   * второй раз отдавать его здесь незачем. */
  outcome?: GradingOutcome;
  gradedAt?: string; // ISO UTC с Z
}

export interface SaveAttemptAnswersInput {
  answers: AttemptAnswerDto[];
}

export interface ListAttemptsQuery {
  examId?: string;
  status?: ExamAttemptStatus;
  limit?: number;
}

/** Сколько попыток по экзамену уже завели ученики. Число нужно редактору:
 * попытка живёт снимком формы на момент старта (ADR-0022), и учитель должен
 * видеть, что его правка достанется только тем, кто начнёт заново. */
export interface ExamAttemptCountDto {
  /** Все попытки экзамена: и те, что идут сейчас, и уже сданные. */
  total: number;
}

export const ATTEMPT_LIMITS = { answerText: 5000, optionsPerAnswer: 10 } as const;

export const ATTEMPT_NOT_FOUND_MESSAGE = 'Попытка не найдена. Обновите страницу.';

// Правило ТЗ 4.4, п.1: старт попытки на неопубликованной форме — отказ.
export const EXAM_NOT_PUBLISHED_MESSAGE =
  'Этот экзамен ещё не открыт для сдачи. Обратитесь к учителю.';

// Правило ТЗ 4.4, п.4/6/7: сохранить ответ или сдать можно только попытку в
// работе — свою и до дедлайна. Дедлайн — отдельное сообщение ниже, здесь про
// «уже сдана».
export const ATTEMPT_NOT_IN_PROGRESS_MESSAGE =
  'Эта попытка уже сдана. Открыть новую можно, если учитель разрешил ещё одну.';

// Правило ТЗ 4.4, п.7: время считает сервер — запрос после дедлайна получает
// отказ, а не тихое сохранение мимо часов, которых уже нет.
export const ATTEMPT_EXPIRED_MESSAGE =
  'Время экзамена вышло. Попытка закрыта, ответ не сохранён.';

// Правило ТЗ 4.4, п.5: ответ на вопрос не из снимка — не молчаливый мусор.
export const ATTEMPT_UNKNOWN_ITEM_MESSAGE =
  'Это вопрос не из вашей попытки. Обновите страницу и отвечайте на вопросы с экрана.';

// Находка аудита PR #175 (docs/PLAN.md §11): сохранение ответа — оптимистичная
// блокировка (exam-attempt-save.ts), а не «прочитал → слил → записал». Это
// сообщение — крайний случай, когда несколько сохранений подряд не смогли
// разойтись по времени (бот и кабинет пишут в одну секунду снова и снова);
// сам ответ при этом не потерян молча — отказ и понятное действие.
export const ATTEMPT_SAVE_CONFLICT_MESSAGE =
  'Не удалось сохранить ответ — его одновременно правили из другого места. ' +
  'Отправьте ответ ещё раз.';
