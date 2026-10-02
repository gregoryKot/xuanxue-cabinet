// Замена прежнего файла к тому же вопросу на `complete` (ADR-0086/ADR-0137,
// тот же приём, что upsertLinkMediaAsset у ссылки) — явным поиском и
// удалением, не upsert по индексу: у `kind: 'file'` своего уникального
// индекса на (attemptId, itemId) нет, запись создаёт сам `complete`, а не
// гонка параллельных upsert. Вынесено из AnswerVideoCompleteService
// (файл-лимит CLAUDE.md «Храповики»: сервису понадобилось место под
// идемпотентный повтор, F47 аудита 2026-10-01). Байты старого убираются
// журналом сирот, документы обеих коллекций удаляются.
import type { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import type { MediaAssetRecord } from '../media/media-asset.schema';
import type { StorageOrphansService } from '../storage/storage-orphans.service';
import type { RawLeanAnswerVideo } from './answer-video.mapper';
import type { AnswerVideoRecord } from './answer-video.schema';

interface ReplacePreviousFileDeps {
  videoModel: Model<AnswerVideoRecord>;
  mediaModel: Model<MediaAssetRecord>;
  orphans: StorageOrphansService;
}

interface ReplacePreviousFileTarget {
  attemptId: string;
  itemId: string;
  now: DateTime;
}

export async function replacePreviousFile(
  deps: ReplacePreviousFileDeps,
  target: ReplacePreviousFileTarget,
): Promise<void> {
  const { videoModel, mediaModel, orphans } = deps;
  const { attemptId, itemId, now } = target;
  const previous = await mediaModel
    .find({ attemptId, itemId, kind: 'file' })
    .lean<{ answerVideoId?: { toString(): string } }[]>();
  for (const prev of previous) {
    if (!prev.answerVideoId) continue;
    const prevVideo = await videoModel
      .findById(prev.answerVideoId.toString())
      .lean<RawLeanAnswerVideo | null>();
    if (!prevVideo) continue;
    await orphans.removeNow(prevVideo.key, now);
    await videoModel.deleteOne({ _id: prevVideo._id });
  }
  await mediaModel.deleteMany({ attemptId, itemId, kind: 'file' });
}
