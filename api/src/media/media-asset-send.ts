// Учитель просит переслать видео экзамена себе в бота ещё раз — кнопка на
// карточке проверки (ADR-0095, уточняет ADR-0023): пересылка в момент
// получения — best-effort (exam-media-forward.ts), и тихий сбой значил
// «видео не увидит никто». Вынесено из MediaAssetsService (файл-лимит
// CLAUDE.md «Храповики»), тем же приёмом, что media-asset-insert.ts.
//
// Чат берётся не из тела запроса, а через порт (SECURITY §3,
// exam-video-delivery.port.ts): реализация в telegram/ сама резолвит его по
// userId текущего пользователя, минуя переключатель уведомлений — это
// действие по кнопке, не рассылка (SECURITY §9, ADR-0026/0036: активного
// личного чата достаточно).
import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import {
  EXAM_MEDIA_NOT_FOUND_MESSAGE,
  EXAM_MEDIA_NO_BOT_CHAT_MESSAGE,
  EXAM_MEDIA_SEND_FAILED_MESSAGE,
} from '@xuanxue/shared';
import { ConflictError, NotFoundError } from '../common/errors';
import type { ExamAttemptRecord } from '../exams/exam-attempt.schema';
import type { UsersService } from '../users/users.service';
import type { ExamVideoDeliveryPort } from './exam-video-delivery.port';
import { loadAttemptOwnerInfo } from './media-attempt-owner';
import { decryptMediaAsset, type RawLeanMediaAsset } from './media-asset.mapper';
import type { ExamVideoTelegramType, MediaAssetRecord } from './media-asset.schema';

export interface SendMediaToChatDeps {
  model: Model<MediaAssetRecord>;
  attemptModel: Model<ExamAttemptRecord>;
  usersService: UsersService;
}

export async function sendMediaToChat(
  deps: SendMediaToChatDeps,
  delivery: ExamVideoDeliveryPort,
  attemptId: string,
  mediaId: string,
  requesterId: string,
): Promise<void> {
  const media = await loadTelegramMedia(deps.model, attemptId, mediaId);
  const owner = await loadAttemptOwnerInfo(deps.attemptModel, attemptId);
  // Попытка нашлась через саму media-запись выше — исчезнуть между двумя
  // запросами она в теории может (гонка с удалением аккаунта), тот же отказ.
  if (!owner) throw new NotFoundError(EXAM_MEDIA_NOT_FOUND_MESSAGE);

  const chatId = await delivery.resolveChatId(requesterId);
  if (!chatId) throw new ConflictError(EXAM_MEDIA_NO_BOT_CHAT_MESSAGE);

  const student = await deps.usersService.findById(owner.userId);
  const caption = `Видео от ${student?.name ?? 'ученика'} — экзамен «${owner.examTitle}».`;
  const delivered = await delivery.sendVideo({
    chatId,
    fileId: media.fileId,
    telegramType: media.telegramType,
    caption,
  });
  if (!delivered) throw new ConflictError(EXAM_MEDIA_SEND_FAILED_MESSAGE);
}

async function loadTelegramMedia(
  model: Model<MediaAssetRecord>,
  attemptId: string,
  mediaId: string,
): Promise<{ fileId: string; telegramType?: ExamVideoTelegramType }> {
  if (!Types.ObjectId.isValid(mediaId))
    throw new NotFoundError(EXAM_MEDIA_NOT_FOUND_MESSAGE);
  const doc = await model.findById(mediaId).lean<RawLeanMediaAsset | null>();
  if (!doc || doc.attemptId.toString() !== attemptId || doc.kind !== 'telegram') {
    throw new NotFoundError(EXAM_MEDIA_NOT_FOUND_MESSAGE);
  }
  const { fileId, telegramType } = decryptMediaAsset(doc);
  // kind: 'telegram' всегда пишется с fileId (insertMediaAsset,
  // attachTelegramVideo) — пусто здесь означало бы битую запись, не то же
  // самое, что «не нашли»; пользователю разбираться незачем (SECURITY §3).
  if (!fileId) throw new NotFoundError(EXAM_MEDIA_NOT_FOUND_MESSAGE);
  return { fileId, telegramType };
}
