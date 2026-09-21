// Вынесено из MediaAssetsService (файл-лимит CLAUDE.md «Храповики») — один
// запрос к exam_attempts, общий для всех путей привязки и снятия видео:
// владелец попытки (для проверки SECURITY §3), снимок блоков (для проверки
// itemId, ADR-0037, media-item-lookup.ts) и статус (для проверки `graded`,
// ADR-0086, MediaAssetsService.addLink/remove) — не три отдельных похода в базу.
import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import type { ExamAttemptStatus } from '@xuanxue/shared';
import { decrypt, decryptJson } from '../utils/encryption';
import type { AttemptBlockRecord, ExamAttemptRecord } from '../exams/exam-attempt.schema';

export interface AttemptOwnerInfo {
  userId: string;
  examTitle: string;
  blocks: AttemptBlockRecord[];
  status: ExamAttemptStatus;
}

export async function loadAttemptOwnerInfo(
  attemptModel: Model<ExamAttemptRecord>,
  attemptId: string,
): Promise<AttemptOwnerInfo | null> {
  if (!Types.ObjectId.isValid(attemptId)) return null;
  const doc = await attemptModel
    .findById(attemptId, { userId: 1, examTitle: 1, blocks: 1, status: 1 })
    .lean<{
      userId: Types.ObjectId;
      examTitle: string;
      blocks: string;
      status: ExamAttemptStatus;
    } | null>();
  if (!doc) return null;
  return {
    userId: doc.userId.toString(),
    examTitle: decrypt(doc.examTitle) ?? doc.examTitle,
    blocks: decryptJson<AttemptBlockRecord[]>(doc.blocks) ?? [],
    status: doc.status,
  };
}
