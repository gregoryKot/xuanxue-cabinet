import type { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import type { LessonDto, UpdateLessonInput } from '@xuanxue/shared';
import type { LessonLinkRebuildService } from '../broadcasts/lesson-link-rebuild.service';
import { NotFoundError } from '../common/errors';
import { assertLeaderIdIfProvided } from '../users/assert-teacher';
import type { UserRecord } from '../users/user.schema';
import { decryptRecord } from '../utils/encryption';
import { markCancelledAt } from './lesson-cancel-mark';
import { toLessonDto, type LeanLesson } from './lesson.mapper';
import { LESSON_ENCRYPT_SCHEMA, type LessonRecord } from './lesson.schema';
import {
  LESSON_NOT_FOUND,
  assertDurationEditable,
  assertLessonId,
} from './lessons.queries';
import { buildUpdateCommand } from './lessons.update';

/** linkRebuilt: undefined — пересборка не требовалась (ни темы, ни времени в PATCH). */
export interface LessonUpdateResult {
  lesson: LessonDto;
  linkRebuilt?: boolean;
}

export interface LessonUpdateDeps {
  model: Model<LessonRecord>;
  userModel: Model<UserRecord>;
  lessonLinkRebuild: LessonLinkRebuildService;
}

// Перенос приводит ещё не ушедшую рассылку в соответствие (ADR-0054); тема
// попадает в пост через {тема}, поэтому её смена с сайта должна пересобирать ещё
// не ушедший пост так же, как из бота. Сбой не откатывает PATCH — rebuild
// логирует его сам.
export async function updateLesson(
  deps: LessonUpdateDeps,
  id: string,
  input: UpdateLessonInput,
  now: DateTime,
): Promise<LessonUpdateResult> {
  const { model, userModel, lessonLinkRebuild } = deps;
  assertLessonId(id);
  if (input.durationMin !== undefined) await assertDurationEditable(model, id);
  await assertLeaderIdIfProvided(userModel, input.leaderId);
  if (input.status === 'cancelled') await markCancelledAt(model, id, now);
  const doc = await model
    .findOneAndUpdate({ _id: id }, buildUpdateCommand(input), { returnDocument: 'after' })
    .lean<LeanLesson>();
  if (!doc) throw new NotFoundError(LESSON_NOT_FOUND);
  const needsRebuild = input.startsAt !== undefined || input.topic !== undefined;
  const linkRebuilt = needsRebuild
    ? await lessonLinkRebuild.rebuild(doc._id, now)
    : undefined;
  return { lesson: toLessonDto(decryptRecord(doc, LESSON_ENCRYPT_SCHEMA)), linkRebuilt };
}
