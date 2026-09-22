// Локальная резервная копия несохранённых ответов попытки (аудит 2026-09-21,
// MED «потеря ответа ученика»): `useAttemptAutosave.ts` держал единственную
// копию несохранённого ответа в памяти вкладки — сеть пропала (метро, сел
// телефон, форс-килл PWA), `pagehide`/`visibilitychange` зовут flush(), PATCH
// падает, повтор через 4 с уже не сработает (вкладка выгружена), а следующее
// открытие подтягивает только то, что долетело до сервера.
//
// Не через hooks/useFormDraft.ts (ADR-0052): тот хук держит форму целиком в
// `useState` и решает «правки есть» через `JSON.stringify` всего состояния —
// подходит для формы редактора, но не для ответов попытки, которые нарочно
// живут в `Map` через ref (не в состоянии — комментарий в шапке
// useAttemptAutosave.ts: правка на каждый символ не должна пересобирать
// список из полусотни вопросов). Нужно ещё частичное снятие — один
// сохранённый ответ убирается из черновика, остальные dirty остаются на
// месте, а useFormDraft умеет только «весь черновик разом». Поэтому здесь —
// тонкий слой поверх той же raw-версии хранилища (lib/formDraft.ts), а не
// вторая реализация черновика: TTL в 7 суток, приватный режим Safari и общая
// чистка при явном выходе (clearAllDrafts, useLogout.ts) достаются бесплатно
// — ключ `attempt:<id>` попадает под тот же префикс `xuanxue.draft.`. На 401
// черновик не трогаем нарочно, тем же приёмом, что у форм редактора: ученик
// войдёт заново и найдёт ответ на месте.
import type { AttemptAnswerDto } from '@xuanxue/shared';
import { clearDraft, readDraft, writeDraft } from '../lib/formDraft';

type AttemptAnswerDraft = Record<string, AttemptAnswerDto>;

function draftKey(attemptId: string): string {
  return `attempt:${attemptId}`;
}

function readAnswerDraft(attemptId: string): AttemptAnswerDraft {
  return readDraft<AttemptAnswerDraft>(draftKey(attemptId), Date.now()) ?? {};
}

function answersEqual(a: AttemptAnswerDto | undefined, b: AttemptAnswerDto): boolean {
  return a !== undefined && JSON.stringify(a) === JSON.stringify(b);
}

export interface AttemptDraftBootstrap {
  /** Ответы для старта хука — серверный снимок, поверх — уцелевший черновик. */
  answers: Map<string, AttemptAnswerDto>;
  /** Вопросы, где черновик отличается от сервера, — сразу dirty:
   * автосохранение отправит их само, без правки от ученика. */
  recoveredIds: string[];
}

/**
 * Серверный снимок — база; черновик из localStorage накладывается только на
 * вопросы, где он отличается от того, что вернул сервер. Сравнивать
 * `updatedAt`/`savedAt` не с чем: `ExamAttemptDto` не отдаёт время последнего
 * сохранения ответов (exam-attempt.mapper.ts) — у попытки есть `updatedAt` от
 * `timestamps: true`, но маппер его не копирует наружу, и ответы правятся не
 * им одним (submit) — использовать было бы неверно. Совпавший ответ черновика
 * не нужен вовсе.
 */
export function bootstrapAttemptAnswers(
  attemptId: string,
  serverAnswers: readonly AttemptAnswerDto[],
): AttemptDraftBootstrap {
  const answers = new Map(serverAnswers.map((a) => [a.itemId, a]));
  const draft = readAnswerDraft(attemptId);
  const recoveredIds: string[] = [];
  for (const [itemId, draftAnswer] of Object.entries(draft)) {
    if (answersEqual(answers.get(itemId), draftAnswer)) continue;
    answers.set(itemId, draftAnswer);
    recoveredIds.push(itemId);
  }
  return { answers, recoveredIds };
}

/** Пишется на каждую правку (setAnswer в useAttemptAutosave.ts) — единственная
 * копия несохранённого ответа не должна жить только в памяти вкладки. */
export function writeAttemptAnswerDraft(
  attemptId: string,
  answer: AttemptAnswerDto,
): void {
  const draft = readAnswerDraft(attemptId);
  draft[answer.itemId] = answer;
  writeDraft(draftKey(attemptId), draft, Date.now());
}

/** Успешный PATCH — эти ответы уже на сервере, снимаем их из черновика,
 * остальные (ещё не сохранённые) остаются на месте. Пустой черновик после
 * этого убирается целиком, а не висит пустым объектом. */
export function forgetSavedAnswers(attemptId: string, itemIds: readonly string[]): void {
  const draft = readAnswerDraft(attemptId);
  for (const itemId of itemIds) delete draft[itemId];
  if (Object.keys(draft).length === 0) clearDraft(draftKey(attemptId));
  else writeDraft(draftKey(attemptId), draft, Date.now());
}

/** Попытка завершена — отправлена (submit, useAttempt.ts) или закрыта
 * дедлайном (сервер отклонил сохранение ATTEMPT_EXPIRED_MESSAGE,
 * useAttemptAutosave.ts) — дальше редактировать нечего, черновик убирается
 * целиком, а не по одному ответу. */
export function clearAttemptDraft(attemptId: string): void {
  clearDraft(draftKey(attemptId));
}
