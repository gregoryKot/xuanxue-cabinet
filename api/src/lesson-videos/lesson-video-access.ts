// Доступ к видео записи занятия и проверка его готовности (ADR-0180) — вынесено из
// LessonVideosService (файл-лимит CLAUDE.md «Храповики»): сервис остаётся про отдачу
// (ссылка, кадр), здесь — кому и какое видео можно брать по id. Чистые функции с
// явными зависимостями.
//
// Видео, которое ещё грузится частями (`uploading`), ни показать, ни привязать к
// записи нельзя: проверка готовности стоит везде, где видео берут по id.
import { Types, type Model } from 'mongoose';
import {
  LESSON_VIDEO_NOT_FOUND_MESSAGE,
  LESSON_VIDEO_UPLOADING_MESSAGE,
  isStaffRole,
} from '@xuanxue/shared';
import { InvalidInputError, NotFoundError } from '../common/errors';
import { assertObjectId } from '../common/object-id';
import type { LessonRecord } from '../lessons/lesson.schema';
import type { UserLean } from '../users/users.service';
import { isLessonVideoReady, type RawLeanLessonVideo } from './lesson-video.mapper';
import type { LessonVideoRecord } from './lesson-video.schema';

export interface LessonVideoAccessDeps {
  model: Model<LessonVideoRecord>;
  lessonModel: Model<LessonRecord>;
}

/** Готовое видео, которое вправе открыть этот человек. Штат — по роли (данные
 * школы, ADR-0010). Остальные — только если видео стоит в записи какого-нибудь
 * занятия: так же видны записи в архиве (`GET /me/lessons/archive`, ADR-0114), и
 * только что загруженный, но не привязанный файл посторонним не отдаётся. Не
 * готовое, чужое и несуществующее отвечают одним 404, не подтверждаем существование
 * того, что человеку не положено (SECURITY §3). Общая проверка для видео и кадра —
 * вторую не пишем. `fields: '+poster'` — кадр с `select: false`
 * (video-upload.schema.ts) читается, только когда его просят. */
export async function loadAccessibleLessonVideo(
  { model, lessonModel }: LessonVideoAccessDeps,
  id: string,
  user: UserLean,
  fields?: string,
): Promise<RawLeanLessonVideo> {
  assertObjectId(id, LESSON_VIDEO_NOT_FOUND_MESSAGE);
  const doc = await model.findById(id, fields).lean<RawLeanLessonVideo | null>();
  if (!doc || !isLessonVideoReady(doc)) {
    throw new NotFoundError(LESSON_VIDEO_NOT_FOUND_MESSAGE);
  }
  if (isStaffRole(user.roles)) return doc;
  const attached = await lessonModel.exists({ 'recordings.videoId': id });
  if (!attached) throw new NotFoundError(LESSON_VIDEO_NOT_FOUND_MESSAGE);
  return doc;
}

/** Зовёт LessonsService.addRecording перед записью с `videoId`: сохранить ссылку
 * на видео, которого нет или которое ещё грузится, значило бы молча сломать
 * показ. Не готовое — отдельный текст: учителю нужно дождаться, а не грузить заново. */
export async function assertLessonVideoReady(
  model: Model<LessonVideoRecord>,
  id: string,
): Promise<void> {
  if (!Types.ObjectId.isValid(id))
    throw new InvalidInputError(LESSON_VIDEO_NOT_FOUND_MESSAGE);
  const doc = await model
    .findById(id, { status: 1 })
    .lean<Pick<RawLeanLessonVideo, 'status'> | null>();
  if (!doc) throw new InvalidInputError(LESSON_VIDEO_NOT_FOUND_MESSAGE);
  if (!isLessonVideoReady(doc)) {
    throw new InvalidInputError(LESSON_VIDEO_UPLOADING_MESSAGE);
  }
}
