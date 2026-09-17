// Вынесено из MediaAssetsService (файл-лимит CLAUDE.md «Храповики») — один
// запрос к exam_attempts, общий для всех трёх путей привязки видео: владелец
// попытки (для проверки SECURITY §3) и снимок блоков (для проверки itemId,
// ADR-0037, media-item-lookup.ts), не два отдельных похода в базу.
import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import { decrypt, decryptJson } from '../utils/encryption';
import type { AttemptBlockRecord, ExamAttemptRecord } from '../exams/exam-attempt.schema';

export interface AttemptOwnerInfo {
  userId: string;
  examTitle: string;
  blocks: AttemptBlockRecord[];
}

export async function loadAttemptOwnerInfo(
  attemptModel: Model<ExamAttemptRecord>,
  attemptId: string,
): Promise<AttemptOwnerInfo | null> {
  if (!Types.ObjectId.isValid(attemptId)) return null;
  const doc = await attemptModel
    .findById(attemptId, { userId: 1, examTitle: 1, blocks: 1 })
    .lean<{ userId: Types.ObjectId; examTitle: string; blocks: string } | null>();
  if (!doc) return null;
  return {
    userId: doc.userId.toString(),
    examTitle: decrypt(doc.examTitle) ?? doc.examTitle,
    blocks: decryptJson<AttemptBlockRecord[]>(doc.blocks) ?? [],
  };
}
