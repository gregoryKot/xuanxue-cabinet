// Единственный маппер ExamAttemptRecord (lean, уже расшифрованный) →
// ExamAttemptDto (CLAUDE.md, раздел «API»: документ Mongoose наружу не
// возвращается). Обязательный по ТЗ 4.4 инвариант живёт здесь: снимок хранит
// `correct` у варианта и `criteria` у вопроса (AttemptOptionRecord/
// AttemptQuestionRecord, exam-attempt.schema.ts), но `toAttemptDto` их не
// копирует — за пределы этого файла они не выходят (e2e-тест на старт
// попытки проверяет именно это).
import type { Types } from 'mongoose';
import type {
  AttemptAnswerDto,
  AttemptBlockDto,
  AttemptOptionDto,
  AttemptQuestionDto,
  ExamAttemptDto,
} from '@xuanxue/shared';
import { toIsoUtc } from '../common/iso-date';
import { decryptRecord } from '../utils/encryption';
import {
  EXAM_ATTEMPT_ENCRYPT_SCHEMA,
  type AttemptBlockRecord,
  type AttemptOptionRecord,
  type AttemptQuestionRecord,
  type ExamAttemptRecord,
} from './exam-attempt.schema';

/** ExamAttemptRecord как его отдаёт `.lean()` до расшифровки — `blocks`/
 * `answers` ещё строка (encJson, exam-attempt.schema.ts). `Pick<T, keyof T>`
 * вместо простого пересечения — тот же приём, что у `RawLeanExam`/
 * `RawLeanExamItem` (exam.mapper.ts/exam-item.mapper.ts): иначе тип не
 * проходит ограничение `T extends Record<string, unknown>` у `decryptRecord`. */
export type RawLeanExamAttempt = Pick<ExamAttemptRecord, keyof ExamAttemptRecord> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

/** То же самое после `decryptRecord` и разбора JSON (см.
 * `ExamAttemptsService.decrypt`) — `blocks`/`answers` уже настоящие массивы. */
export type LeanExamAttempt = Omit<RawLeanExamAttempt, 'blocks' | 'answers'> & {
  blocks: AttemptBlockRecord[];
  answers: AttemptAnswerDto[];
};

function toStudentOption(option: AttemptOptionRecord): AttemptOptionDto {
  return { id: option.id, text: option.text };
}

function toStudentQuestion(question: AttemptQuestionRecord): AttemptQuestionDto {
  return {
    itemId: question.itemId,
    version: question.version,
    kind: question.kind,
    prompt: question.prompt,
    hint: question.hint,
    options: question.options.map(toStudentOption),
  };
}

function toStudentBlock(block: AttemptBlockRecord): AttemptBlockDto {
  return {
    id: block.id,
    title: block.title,
    questions: block.questions.map(toStudentQuestion),
  };
}

/** `blocks`/`answers` хранятся строкой (encJson, exam-attempt.schema.ts) —
 * decryptRecord возвращает их с тем же типом `string`, хотя на деле это уже
 * разобранный JSON; приводим явно один раз здесь (тот же приём, что у
 * ExamsService.decrypt/ExamItemsService.decrypt). Экспортирована — зовут и
 * ExamAttemptsService, и exam-attempt-lifecycle.ts. */
export function decryptAttempt(doc: RawLeanExamAttempt): LeanExamAttempt {
  const decrypted = decryptRecord(doc, EXAM_ATTEMPT_ENCRYPT_SCHEMA);
  return {
    ...decrypted,
    blocks: decrypted.blocks as unknown as AttemptBlockRecord[],
    answers: decrypted.answers as unknown as AttemptAnswerDto[],
  };
}

/** `userName` параметром, не запросом внутри маппера (CLAUDE.md «API»:
 * маппер — единственная точка сборки DTO, но в базу сам не ходит) — сотруднику
 * его подставляет `ExamAttemptsService.list` одним запросом на весь список,
 * ученику (или другим вызывающим) не передаётся вовсе. */
export function toAttemptDto(doc: LeanExamAttempt, userName?: string): ExamAttemptDto {
  return {
    id: doc._id.toString(),
    examId: doc.examId.toString(),
    examTitle: doc.examTitle,
    userId: doc.userId.toString(),
    userName,
    status: doc.status,
    blocks: doc.blocks.map(toStudentBlock),
    answers: doc.answers,
    startedAt: toIsoUtc(doc.startedAt),
    deadlineAt: doc.deadlineAt ? toIsoUtc(doc.deadlineAt) : undefined,
    submittedAt: doc.submittedAt ? toIsoUtc(doc.submittedAt) : undefined,
    expired: doc.expired,
  };
}
