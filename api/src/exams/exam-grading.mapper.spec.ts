import { Types } from 'mongoose';
import { toGradingDto, type RawLeanExamGrading } from './exam-grading.mapper';

const ATTEMPT_ID = new Types.ObjectId();
const EXAM_ID = new Types.ObjectId();
const USER_ID = new Types.ObjectId();
const GRADER_ID = new Types.ObjectId();
const GRADED_AT = new Date(Date.UTC(2026, 8, 13, 9, 0, 0));

function fullGrading(): RawLeanExamGrading {
  return {
    _id: new Types.ObjectId(),
    attemptId: ATTEMPT_ID,
    examId: EXAM_ID,
    userId: USER_ID,
    graderId: GRADER_ID,
    comment: 'Хорошая работа, доработайте колено',
    outcome: 'needs_work',
    gradedAt: GRADED_AT,
    createdAt: GRADED_AT,
    updatedAt: GRADED_AT,
  };
}

describe('toGradingDto', () => {
  it('переносит все поля, id и даты — строками', () => {
    const doc = fullGrading();

    expect(toGradingDto(doc)).toEqual({
      id: doc._id.toString(),
      attemptId: ATTEMPT_ID.toString(),
      examId: EXAM_ID.toString(),
      userId: USER_ID.toString(),
      graderId: GRADER_ID.toString(),
      comment: 'Хорошая работа, доработайте колено',
      outcome: 'needs_work',
      gradedAt: '2026-09-13T09:00:00.000Z',
    });
  });

  it('отсутствующий общий комментарий — undefined, не null', () => {
    const doc = fullGrading();
    doc.comment = undefined;

    expect(toGradingDto(doc).comment).toBeUndefined();
  });
});
