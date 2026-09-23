// Билдеры апдейта `bot_sessions` для черновика сборки экзамена (ТЗ 4б.4,
// docs/PLAN.md §12) — вынесено из bot-session.service.ts (файл-лимит 150
// строк, CLAUDE.md «Храповики»), тем же приёмом, что new-exam-item-draft-
// wait.ts: саму запись делает BotSessionService, здесь — чистые функции, ЧТО
// записать, юнит-тест без Mongo.
import type { DateTime } from 'luxon';
import { Types } from 'mongoose';
import type { NewExamStep } from './bot-session.schema';

// Отметки и шаги растянуты дольше одного сообщения, но короче суток — та же
// величина, что у черновика вопроса (new-exam-item-draft-wait.ts).
const NEW_EXAM_WAIT_MINUTES = 60;

/** Черновик сборки экзамена, расшифрованный (bot-session.service.ts,
 * get()) — форма совпадает с тем, что копится в build*-полях схемы. */
export interface NewExamDraft {
  step: NewExamStep;
  page: number;
  itemIds: string[];
  title?: string;
  timeLimitMin?: number;
  attemptsAllowed?: number;
  savedExamId?: string;
}

/** Новый черновик (команда /экзамен, кнопка «Собрать экзамен» — шаг 'pick'
 * заводится сразу, отметки нужно копить с первого сообщения) — `$unset`
 * чистит build*-поля прошлого ЗАБРОШЕННОГО черновика этого же чата и поля
 * прошлого вида ожидания (ADR-0024: «одно активное ожидание на чат»). */
export function startNewExamDraftUpdate(now: DateTime): {
  $set: Record<string, unknown>;
  $unset: Record<string, ''>;
} {
  return {
    $set: {
      kind: 'examBuildDraft',
      buildStep: 'pick',
      buildItemIds: [] as Types.ObjectId[],
      buildPage: 0,
      expiresAt: now.plus({ minutes: NEW_EXAM_WAIT_MINUTES }).toJSDate(),
    },
    $unset: {
      buildTitle: '',
      buildTimeLimitMin: '',
      buildAttemptsAllowed: '',
      buildSavedExamId: '',
      lessonId: '',
      attemptId: '',
      questionIndex: '',
      itemId: '',
      draftStep: '',
      draftKind: '',
      draftPrompt: '',
      draftOptions: '',
      draftSavedItemId: '',
    },
  };
}

export interface NewExamDraftPatch {
  step: NewExamStep;
  page?: number;
  itemIds?: string[];
  title?: string;
  timeLimitMin?: number;
  attemptsAllowed?: number;
  savedExamId?: string;
}

/** Шаг вперёд внутри уже начатой сборки — поля, которых нет в `patch`,
 * остаются как есть; `step` — всегда, даже когда шаг не меняется (отметка
 * следующего вопроса), чтобы TTL продлевался на каждом шаге. Отсутствие
 * `timeLimitMin` в патче шага 'attempts' и позже читается как «без лимита»
 * (шаг решил вопрос раньше, чем поле появилось бы) — не сентинел, а факт
 * того, что дальше сессия не идёт без явного выбора. */
export function newExamDraftUpdate(
  patch: NewExamDraftPatch,
  now: DateTime,
): Record<string, unknown> {
  const set: Record<string, unknown> = {
    buildStep: patch.step,
    expiresAt: now.plus({ minutes: NEW_EXAM_WAIT_MINUTES }).toJSDate(),
  };
  if (patch.page !== undefined) set.buildPage = patch.page;
  if (patch.itemIds !== undefined) {
    set.buildItemIds = patch.itemIds.map((id) => new Types.ObjectId(id));
  }
  if (patch.title !== undefined) set.buildTitle = patch.title;
  if (patch.timeLimitMin !== undefined) set.buildTimeLimitMin = patch.timeLimitMin;
  if (patch.attemptsAllowed !== undefined)
    set.buildAttemptsAllowed = patch.attemptsAllowed;
  if (patch.savedExamId !== undefined) {
    set.buildSavedExamId = new Types.ObjectId(patch.savedExamId);
  }
  return set;
}
