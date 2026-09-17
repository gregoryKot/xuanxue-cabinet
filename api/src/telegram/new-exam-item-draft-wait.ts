// Билдеры апдейта `bot_sessions` для черновика вопроса учителя (ТЗ 4б.3,
// docs/PLAN.md §12) — вынесено из bot-session.service.ts (файл-лимит 150
// строк, CLAUDE.md «Храповики»), тем же приёмом, что exam-answer-wait.ts:
// саму запись делает BotSessionService (encryptRecord + model.updateOne),
// здесь — чистые функции, ЧТО записать, юнит-тест без Mongo.
import type { DateTime } from 'luxon';
import { Types } from 'mongoose';
import type { ExamItemKind } from '@xuanxue/shared';
import type { NewExamItemStep } from './bot-session.schema';

// Составление вопроса — несколько сообщений подряд (формулировка, варианты,
// критерии), дольше, чем «Изменить тему» (10 минут), но не весь день — та же
// величина, что у ответа на экзамен (exam-answer-wait.ts).
const NEW_EXAM_ITEM_WAIT_MINUTES = 60;

export interface NewExamItemDraftOption {
  text: string;
  correct: boolean;
}

/** Черновик вопроса, расшифрованный (bot-session.service.ts, get()) — форма
 * совпадает с тем, что копится в draft*-полях схемы. */
export interface NewExamItemDraft {
  step: NewExamItemStep;
  kind?: ExamItemKind;
  prompt?: string;
  criteria?: string;
  options: NewExamItemDraftOption[];
  savedItemId?: string;
}

/** Новый черновик (кнопка выбора типа, screen 1) — `$unset` чистит и
 * draft*-поля прошлого ЗАБРОШЕННОГО черновика этого же чата (иначе критерии
 * или сохранённый id пережили бы новый /вопрос, ADR-0024: «одно активное
 * ожидание на чат»), и поля прошлого вида ожидания (lessonId/attemptId/…) —
 * тот же случай, что у examMedia/examText, комментарий в bot-session.
 * schema.ts у kind. */
export function startNewExamItemDraftUpdate(
  kind: ExamItemKind,
  now: DateTime,
): { $set: Record<string, unknown>; $unset: Record<string, ''> } {
  return {
    $set: {
      kind: 'examItemDraft',
      draftStep: 'prompt',
      draftKind: kind,
      draftOptions: [] as NewExamItemDraftOption[],
      expiresAt: now.plus({ minutes: NEW_EXAM_ITEM_WAIT_MINUTES }).toJSDate(),
    },
    $unset: {
      draftPrompt: '',
      draftCriteria: '',
      draftSavedItemId: '',
      lessonId: '',
      attemptId: '',
      questionIndex: '',
      itemId: '',
      // Заброшенный черновик сборки экзамена (ТЗ 4б.4) того же чата — тот же
      // приём, что draft*-поля выше, симметрично new-exam-draft-wait.ts.
      buildStep: '',
      buildItemIds: '',
      buildPage: '',
      buildTitle: '',
      buildTimeLimitMin: '',
      buildAttemptsAllowed: '',
      buildSavedExamId: '',
    },
  };
}

export interface NewExamItemDraftPatch {
  step: NewExamItemStep;
  prompt?: string;
  criteria?: string;
  options?: NewExamItemDraftOption[];
  savedItemId?: string;
}

/** Шаг вперёд/правка внутри уже начатого черновика — поля, которых нет в
 * `patch`, остаются как есть (вызывающий код передаёт только то, что
 * изменилось на этом шаге; `step` — всегда, даже когда шаг не меняется, чтобы
 * запись была явной, не «наполовину»). TTL продлевается на каждом шаге —
 * составление вопроса растянуто на несколько сообщений подряд. */
export function newExamItemDraftUpdate(
  patch: NewExamItemDraftPatch,
  now: DateTime,
): Record<string, unknown> {
  const set: Record<string, unknown> = {
    draftStep: patch.step,
    expiresAt: now.plus({ minutes: NEW_EXAM_ITEM_WAIT_MINUTES }).toJSDate(),
  };
  if (patch.prompt !== undefined) set.draftPrompt = patch.prompt;
  if (patch.criteria !== undefined) set.draftCriteria = patch.criteria;
  if (patch.options !== undefined) set.draftOptions = patch.options;
  if (patch.savedItemId !== undefined) {
    set.draftSavedItemId = new Types.ObjectId(patch.savedItemId);
  }
  return set;
}
