// Создание новой попытки (ТЗ 4.4, п.1 и п.3) — вынесено из
// ExamAttemptsService.start(), чтобы сервис оставался диспетчером правил, а
// не сборкой снимка и Mongo-гонки (CLAUDE.md «Файлы», лимит размера — тот же
// приём, что exam-attempt-lifecycle.ts). Гонка двух стартов подряд (двойной
// клик на телефоне) — E11000 по уникальному индексу `(examId, userId,
// attemptNo)` ловится здесь же: конкурент уже занял этот attemptNo первым,
// не плодим вторую попытку, отдаём его (идемпотентность, ТЗ 4.4, п.3).
import type { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import type { AttemptAnswerDto, ExamAttemptDto, ExamDto } from '@xuanxue/shared';
import { isDuplicateKeyError } from '../common/mongo-error-codes';
import { encryptRecord } from '../utils/encryption';
import type { ExamItemsService } from './exam-items.service';
import { findInProgressAttempt } from './exam-attempt-lifecycle';
import { buildAttemptBlocks } from './exam-attempt-snapshot';
import { EXAM_ATTEMPT_ENCRYPT_SCHEMA, ExamAttemptRecord } from './exam-attempt.schema';
import {
  decryptAttempt,
  toAttemptDto,
  type RawLeanExamAttempt,
} from './exam-attempt.mapper';

export async function createAttempt(
  model: Model<ExamAttemptRecord>,
  examItemsService: ExamItemsService,
  exam: ExamDto,
  userId: string,
  attemptsUsed: number,
  now: DateTime,
): Promise<ExamAttemptDto> {
  const itemIds = [...new Set(exam.blocks.flatMap((block) => block.itemIds))];
  const items = await Promise.all(itemIds.map((id) => examItemsService.getById(id)));
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const blocks = buildAttemptBlocks({
    blocks: exam.blocks,
    itemsById,
    shuffleOptions: exam.shuffleOptions,
    random: Math.random,
  });
  const deadlineAt = exam.timeLimitMin
    ? now.plus({ minutes: exam.timeLimitMin })
    : undefined;

  const payload: Record<string, unknown> = {
    examId: exam.id,
    examTitle: exam.title,
    userId,
    attemptNo: attemptsUsed + 1,
    status: 'in_progress',
    blocks,
    answers: [] as AttemptAnswerDto[],
    startedAt: now.toJSDate(),
    deadlineAt: deadlineAt?.toJSDate(),
  };

  try {
    const created = await model.create(
      encryptRecord(payload, EXAM_ATTEMPT_ENCRYPT_SCHEMA),
    );
    const doc = await model.findById(created._id).lean<RawLeanExamAttempt>();
    if (!doc) throw new Error('createAttempt: попытка не найдена сразу после создания');
    return toAttemptDto(decryptAttempt(doc));
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
    const raced = await findInProgressAttempt(model, exam.id, userId);
    if (raced) return toAttemptDto(raced);
    throw err;
  }
}
