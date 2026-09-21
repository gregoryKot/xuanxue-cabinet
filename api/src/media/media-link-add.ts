// Ссылка на видео-ответ: проверки перед записью и сама запись (ADR-0023 —
// путь ссылки, ADR-0086 — повторная заменяет прежнюю, ADR-0084 — она же
// основной путь ответа). Вынесено из MediaAssetsService: файл-лимит CLAUDE.md
// («Храповики») у сервиса выбран, а здесь всё про один путь и читается
// подряд — владение, вопрос, статус работы, запись, уведомление.
//
// Порядок проверок не случаен: сперва владение (SECURITY §3 — чужой
// attemptId получает тот же отказ, что несуществующий), потом вопрос
// (ADR-0037), и только потом статус. Иначе по тексту отказа можно было бы
// узнать, что чужая работа существует и уже проверена.
import type { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import {
  ATTEMPT_NOT_FOUND_MESSAGE,
  EXAM_MEDIA_ATTEMPT_GRADED_MESSAGE,
  EXAM_MEDIA_ITEM_NOT_FOUND_MESSAGE,
  type ExamMediaDto,
} from '@xuanxue/shared';
import { ConflictError, NotFoundError } from '../common/errors';
import type { ExamAttemptRecord } from '../exams/exam-attempt.schema';
import type { ExamMediaNotifierRegistry } from './exam-media-notifier.registry';
import { upsertLinkMediaAsset } from './media-asset-insert';
import type { MediaAssetRecord } from './media-asset.schema';
import { loadAttemptOwnerInfo } from './media-attempt-owner';
import { isVideoItemInSnapshot } from './media-item-lookup';
import { notifyVideoLinkAdded } from './notify-video-link-added';

export interface AddLinkDeps {
  model: Model<MediaAssetRecord>;
  attemptModel: Model<ExamAttemptRecord>;
  notifiers: ExamMediaNotifierRegistry;
}

export interface AddLinkInput {
  attemptId: string;
  userId: string;
  url: string;
  now: DateTime;
  itemId?: string;
}

export async function addLinkMediaAsset(
  deps: AddLinkDeps,
  input: AddLinkInput,
): Promise<ExamMediaDto> {
  const { attemptId, userId, url, now, itemId } = input;
  const owner = await loadAttemptOwnerInfo(deps.attemptModel, attemptId);
  if (!owner || owner.userId !== userId) {
    throw new NotFoundError(ATTEMPT_NOT_FOUND_MESSAGE);
  }
  if (itemId !== undefined && !isVideoItemInSnapshot(owner.blocks, itemId)) {
    throw new NotFoundError(EXAM_MEDIA_ITEM_NOT_FOUND_MESSAGE);
  }
  // ADR-0086: работу уже проверили — учитель поставил итог, глядя на
  // конкретное видео, молча подменять его новой ссылкой нельзя.
  if (owner.status === 'graded') {
    throw new ConflictError(EXAM_MEDIA_ATTEMPT_GRADED_MESSAGE);
  }

  const media = await upsertLinkMediaAsset(deps.model, {
    attemptId,
    userId,
    itemId,
    url,
    receivedAt: now,
  });
  notifyVideoLinkAdded(deps.notifiers, attemptId, owner, userId, itemId, url, now);
  return media;
}
