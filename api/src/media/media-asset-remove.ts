// Снятие одной записи media_assets (ADR-0086) — вынесено из
// MediaAssetsService тем же приёмом, что insertMediaAsset рядом (файл-лимит
// CLAUDE.md «Храповики»): сервис остаётся точкой входа, здесь правила «кто
// что может снять» и само удаление.
//
// Владелец — из сессии, не из пути (SECURITY §3): чужая попытка, чужая
// запись, невалидный `mediaId` и запись другой попытки дают один и тот же
// 404 с ATTEMPT_NOT_FOUND_MESSAGE, без подтверждения, что что-то такое есть.
//
// Штат школы (`isStaffRole`) не ограничен ни владением попыткой, ни `kind`,
// ни статусом: учитель правит и свою ручную отметку, и после оценки. Ученик
// снимает только свою запись `kind: 'link'` — запись из Telegram удалением
// нашей строки не отзывается (видео остаётся в чате учителя), а ручная
// отметка не его. И только до `graded`: там отказ, а не 404, — запись
// законна, просто менять ответ уже поздно.
import type { Model } from 'mongoose';
import {
  ATTEMPT_NOT_FOUND_MESSAGE,
  EXAM_MEDIA_LOCKED_AFTER_GRADING_MESSAGE,
  isStaffRole,
  type ExamMediaKind,
} from '@xuanxue/shared';
import { InvalidInputError, NotFoundError } from '../common/errors';
import { assertObjectId } from '../common/object-id';
import type { ExamAttemptRecord } from '../exams/exam-attempt.schema';
import type { UserLean } from '../users/users.service';
import { loadAttemptOwnerInfo } from './media-attempt-owner';
import type { MediaAssetRecord } from './media-asset.schema';

export interface RemoveMediaAssetParams {
  model: Model<MediaAssetRecord>;
  attemptModel: Model<ExamAttemptRecord>;
  attemptId: string;
  mediaId: string;
  user: UserLean;
}

export async function removeMediaAsset({
  model,
  attemptModel,
  attemptId,
  mediaId,
  user,
}: RemoveMediaAssetParams): Promise<void> {
  const owner = await loadAttemptOwnerInfo(attemptModel, attemptId);
  const staff = isStaffRole(user.roles);
  if (!owner || (!staff && owner.userId !== user.id)) {
    throw new NotFoundError(ATTEMPT_NOT_FOUND_MESSAGE);
  }

  assertObjectId(mediaId, ATTEMPT_NOT_FOUND_MESSAGE);
  const media = await model
    .findOne({ _id: mediaId, attemptId })
    .lean<{ kind: ExamMediaKind } | null>();
  if (!media) throw new NotFoundError(ATTEMPT_NOT_FOUND_MESSAGE);

  if (!staff) {
    if (media.kind !== 'link') throw new NotFoundError(ATTEMPT_NOT_FOUND_MESSAGE);
    if (owner.status === 'graded') {
      throw new InvalidInputError(EXAM_MEDIA_LOCKED_AFTER_GRADING_MESSAGE);
    }
  }

  await model.deleteOne({ _id: mediaId });
}
