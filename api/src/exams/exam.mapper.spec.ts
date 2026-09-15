import { Types } from 'mongoose';
import { toExamDto, type LeanExam } from './exam.mapper';

const EXAM_ID = new Types.ObjectId();
const CREATED_BY = new Types.ObjectId();
const CREATED_AT = new Date(Date.UTC(2026, 8, 1, 10, 0, 0));
const UPDATED_AT = new Date(Date.UTC(2026, 8, 2, 11, 0, 0));

function fullExam(): LeanExam {
  return {
    _id: EXAM_ID,
    title: 'Экзамен по третьей форме',
    description: 'Проверка формы и теории',
    level: 'начальный',
    blocks: [{ id: 'b1', title: 'Форма', itemIds: ['i1'], shuffle: true }],
    shuffleOptions: true,
    timeLimitMin: 30,
    attemptsAllowed: 2,
    status: 'published',
    rubric: [],
    createdBy: CREATED_BY,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  };
}

describe('toExamDto', () => {
  it('переносит все поля, id и даты — строками', () => {
    expect(toExamDto(fullExam())).toEqual({
      id: EXAM_ID.toString(),
      title: 'Экзамен по третьей форме',
      description: 'Проверка формы и теории',
      level: 'начальный',
      blocks: [{ id: 'b1', title: 'Форма', itemIds: ['i1'], shuffle: true }],
      shuffleOptions: true,
      timeLimitMin: 30,
      attemptsAllowed: 2,
      status: 'published',
      rubric: [],
      createdBy: CREATED_BY.toString(),
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-02T11:00:00.000Z',
    });
  });

  it('description/level отсутствуют в документе (после $unset) — пустая строка, не undefined', () => {
    const doc = fullExam();
    doc.description = undefined as unknown as string;
    doc.level = undefined as unknown as string;

    const dto = toExamDto(doc);

    expect(dto.description).toBe('');
    expect(dto.level).toBe('');
  });

  it('timeLimitMin/createdBy отсутствуют — undefined в ответе', () => {
    const doc = fullExam();
    doc.timeLimitMin = undefined;
    doc.createdBy = undefined;

    const dto = toExamDto(doc);

    expect(dto.timeLimitMin).toBeUndefined();
    expect(dto.createdBy).toBeUndefined();
  });

  it('required в записи блока (форма старше ADR-0033) — наружу не уходит', () => {
    const doc = fullExam();
    doc.blocks = [
      { id: 'b1', title: 'Форма', itemIds: ['i1'], shuffle: false, required: true },
    ];

    expect(toExamDto(doc).blocks[0]).not.toHaveProperty('required');
  });

  it('shuffleOptions нет в документе (форма старше ADR-0033) — false, не undefined', () => {
    const doc = fullExam();
    doc.shuffleOptions = undefined as unknown as boolean;

    expect(toExamDto(doc).shuffleOptions).toBe(false);
  });

  it('блоков нет — пустой массив', () => {
    const doc = fullExam();
    doc.blocks = [];

    expect(toExamDto(doc).blocks).toEqual([]);
  });
});
