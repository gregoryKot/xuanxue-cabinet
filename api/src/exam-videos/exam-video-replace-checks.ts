// Шаг 0 замены файла видео (ADR-0189, порядок шагов — exam-video-replace.ts): только
// чтение и проверки. Отказ здесь ничего не меняет, замена остаётся обычной загрузкой, и
// её убирает уборщик по общему правилу.
import { Types, type Model } from 'mongoose';
import type { DateTime } from 'luxon';
import { EXAM_VIDEO_NOT_FOUND_MESSAGE, H264_VIDEO_CODEC } from '@xuanxue/shared';
import { ConflictError, InvalidInputError, NotFoundError } from '../common/errors';
import { assertObjectId } from '../common/object-id';
import type { ExamAttemptRecord } from '../exams/exam-attempt.schema';
import type { ExamItemRecord } from '../exams/exam-item.schema';
import { referencedMediaIds } from '../exams/exam-media-references';
import type { StorageOrphansService } from '../storage/storage-orphans.service';
import { assertExamVideosReady } from './exam-video-access';
import {
  EXAM_VIDEO_ALREADY_REPLACED_MESSAGE,
  EXAM_VIDEO_REPLACE_NOT_H264_MESSAGE,
  EXAM_VIDEO_REPLACE_SELF_MESSAGE,
  EXAM_VIDEO_REPLACE_STALE_MESSAGE,
  EXAM_VIDEO_REPLACE_USED_MESSAGE,
} from './exam-video-replace.messages';
import { ORPHAN_AGE_HOURS } from './exam-video-sweep.service';
import { EXAM_VIDEO_READY_FILTER, type RawLeanExamVideo } from './exam-video.mapper';
import type { ExamVideoRecord } from './exam-video.schema';

// Запас на часы между загрузкой замены и нажатием плюс на расхождение часов инстансов.
export const REPLACEMENT_MAX_AGE_HOURS = ORPHAN_AGE_HOURS / 2;

export interface ReplaceDeps {
  model: Model<ExamVideoRecord>;
  itemModel: Model<ExamItemRecord>;
  attemptModel: Model<ExamAttemptRecord>;
  orphans: StorageOrphansService;
}

export interface ReplaceInput {
  targetId: string;
  replacementId: string;
  now: DateTime;
}

/** Цель и замена, прошедшие все проверки, или отказ с текстом для штата. */
export async function loadReplacementPair(
  deps: ReplaceDeps,
  { targetId, replacementId }: ReplaceInput,
  freshSince: Date,
): Promise<{ target: RawLeanExamVideo; replacement: RawLeanExamVideo }> {
  assertObjectId(targetId, EXAM_VIDEO_NOT_FOUND_MESSAGE);
  const target = await deps.model
    .findOne({ _id: targetId, ...EXAM_VIDEO_READY_FILTER })
    .lean<RawLeanExamVideo | null>();
  if (!target) throw new NotFoundError(EXAM_VIDEO_NOT_FOUND_MESSAGE);
  // Нет такого, кривой id, ещё грузится — те же отказы, что у вопроса с видео.
  await assertExamVideosReady(deps.model, [replacementId]);
  const replacement = await deps.model
    .findById(new Types.ObjectId(replacementId))
    .lean<RawLeanExamVideo | null>();
  if (!replacement) throw new InvalidInputError(EXAM_VIDEO_NOT_FOUND_MESSAGE);
  if (target._id.equals(replacement._id)) {
    throw new InvalidInputError(EXAM_VIDEO_REPLACE_SELF_MESSAGE);
  }
  if (replacement.videoCodec !== H264_VIDEO_CODEC) {
    throw new InvalidInputError(EXAM_VIDEO_REPLACE_NOT_H264_MESSAGE);
  }
  // Первый оригинал не должен смениться промежуточным H.264.
  if (target.originalKey) throw new ConflictError(EXAM_VIDEO_ALREADY_REPLACED_MESSAGE);
  if (replacement.createdAt < freshSince) {
    throw new InvalidInputError(EXAM_VIDEO_REPLACE_STALE_MESSAGE);
  }
  // Та же сверка ссылок, что у уборщика: документ замены удаляется, и ссылка на него
  // повисла бы.
  const used = await referencedMediaIds(deps, 'videoIds', [replacement._id]);
  if (used.length > 0) throw new ConflictError(EXAM_VIDEO_REPLACE_USED_MESSAGE);
  return { target, replacement };
}
