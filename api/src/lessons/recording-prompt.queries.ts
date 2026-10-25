// Чистые правила и запросы шага «Запись?» (recording-prompt.service.ts) —
// вынесены, чтобы сервис держался в файл-лимите 150 строк (CLAUDE.md
// «Храповики»): «занятие закончилось» и отметка «записи не ждём» проверяются
// отдельно от цикла по кандидатам.
import { DateTime } from 'luxon';
import type { Model, Types } from 'mongoose';
import type { LessonRecord } from './lesson.schema';

export interface DueLesson {
  _id: Types.ObjectId;
  classId: Types.ObjectId;
  topic: string;
  startsAt: Date;
  durationMin: number;
  zoomLinkOverride?: string;
}

export const DUE_LESSON_PROJECTION = {
  classId: 1,
  topic: 1,
  startsAt: 1,
  durationMin: 1,
  zoomLinkOverride: 1,
} as const;

export function isLessonOver(lesson: DueLesson, now: DateTime): boolean {
  const endsAt = DateTime.fromJSDate(lesson.startsAt, { zone: 'utc' }).plus({
    minutes: lesson.durationMin,
  });
  return endsAt <= now;
}

/** Занятие шло без ссылки (lesson-link.ts) — вопроса «Запись?» не будет, но
 * отметка `recordingPromptedAt` всё равно ставится: иначе такое занятие
 * занимало бы место в батче PROMPT_BATCH_LIMIT каждый тик, и до занятий со
 * ссылкой очередь могла бы не дойти. Вместе с ней — `recordingDeclinedAt`,
 * чтобы занятие не попало в список «ещё жду запись» (recording-pending.ts).
 * Условный апдейт, как claimOnce: второй тик/инстанс отметку не перебьёт. */
export async function markNoRecordingExpected(
  model: Model<LessonRecord>,
  id: Types.ObjectId,
  now: DateTime,
): Promise<void> {
  await model.updateOne(
    { _id: id, recordingPromptedAt: { $exists: false } },
    {
      $set: { recordingPromptedAt: now.toJSDate(), recordingDeclinedAt: now.toJSDate() },
    },
  );
}
