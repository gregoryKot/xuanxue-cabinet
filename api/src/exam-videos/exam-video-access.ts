// Доступ к видео вопроса и проверка его готовности (ADR-0133, ADR-0165) — вынесено
// из ExamVideosService (файл-лимит CLAUDE.md «Храповики»): сервис остаётся про
// отдачу (ссылка, бот, кэш file_id), здесь — кому и какое видео можно брать по id.
// Чистые функции с явными зависимостями: DI у сервиса не меняется.
//
// Видео, которое ещё грузится частями (`uploading`), ни показать, ни привязать к
// вопросу нельзя: проверка готовности стоит везде, где видео берут по id.
import { Types, type Model } from 'mongoose';
import {
  EXAM_VIDEO_NOT_FOUND_MESSAGE,
  EXAM_VIDEO_UPLOADING_MESSAGE,
  isStaffRole,
} from '@xuanxue/shared';
import { InvalidInputError, NotFoundError } from '../common/errors';
import { assertObjectId } from '../common/object-id';
import { ExamAttemptRecord } from '../exams/exam-attempt.schema';
import type { UserLean } from '../users/users.service';
import { isExamVideoReady, type RawLeanExamVideo } from './exam-video.mapper';
import type { ExamVideoRecord } from './exam-video.schema';

export interface ExamVideoAccessDeps {
  model: Model<ExamVideoRecord>;
  attemptModel: Model<ExamAttemptRecord>;
}

/** Штат — по роли (данные школы, ADR-0010). Ученик — только если видео
 * стоит в снимке ЕГО попытки: тот же 404, что у несуществующего id — не
 * подтверждаем даже факт существования чужого видео (SECURITY §3). Общая
 * проверка для HTTP (signedUrl, кадр-превью) и бота (loadForBot) — вторую
 * проверку не пишем, доступ у всех один и тот же. `fields: '+poster'` — кадр с
 * `select: false` (video-upload.schema.ts) читается, только когда его просят. */
export async function loadAccessibleExamVideo(
  { model, attemptModel }: ExamVideoAccessDeps,
  id: string,
  user: UserLean,
  fields?: string,
): Promise<RawLeanExamVideo> {
  assertObjectId(id, EXAM_VIDEO_NOT_FOUND_MESSAGE);
  if (!isStaffRole(user.roles)) {
    const owns = await attemptModel.exists({ userId: user.id, videoIds: id });
    if (!owns) throw new NotFoundError(EXAM_VIDEO_NOT_FOUND_MESSAGE);
  }
  const doc = await model.findById(id, fields).lean<RawLeanExamVideo | null>();
  if (!doc || !isExamVideoReady(doc)) {
    throw new NotFoundError(EXAM_VIDEO_NOT_FOUND_MESSAGE);
  }
  return doc;
}

/** Вызывает вызывающий слой (ExamItemsService) перед записью вопроса/варианта с
 * `videoId` — сохранить ссылку на видео, которого нет или которое ещё грузится,
 * значило бы молчаливо сломать показ (тот же приём, что
 * ExamImagesService.assertExist). */
export async function assertExamVideosReady(
  model: Model<ExamVideoRecord>,
  ids: readonly string[],
): Promise<void> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return;
  if (unique.some((id) => !Types.ObjectId.isValid(id))) {
    throw new InvalidInputError(EXAM_VIDEO_NOT_FOUND_MESSAGE);
  }
  const found = await model
    .find({ _id: { $in: unique } }, { status: 1 })
    .lean<Pick<RawLeanExamVideo, 'status'>[]>();
  if (found.length !== unique.length) {
    throw new InvalidInputError(EXAM_VIDEO_NOT_FOUND_MESSAGE);
  }
  // Есть, но ещё грузится — не «не найдено»: учителю нужно дождаться, а не
  // загружать заново.
  if (!found.every(isExamVideoReady)) {
    throw new InvalidInputError(EXAM_VIDEO_UPLOADING_MESSAGE);
  }
}
