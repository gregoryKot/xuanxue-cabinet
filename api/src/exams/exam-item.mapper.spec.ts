import { Types } from 'mongoose';
import { toExamItemDto, type LeanExamItem } from './exam-item.mapper';

const OPTION_ID = new Types.ObjectId().toString();
const HISTORY_OPTION_ID = new Types.ObjectId().toString();
const ITEM_ID = new Types.ObjectId();
const AUTHOR_ID = new Types.ObjectId();
const CREATED_AT = new Date(Date.UTC(2026, 8, 1, 10, 0, 0));
const UPDATED_AT = new Date(Date.UTC(2026, 8, 2, 11, 0, 0));

function fullItem(): LeanExamItem {
  return {
    _id: ITEM_ID,
    kind: 'single',
    prompt: 'Что означает «сюань»?',
    options: [{ id: OPTION_ID, text: 'Таинственный', correct: true }],
    status: 'published',
    version: 2,
    history: [
      {
        version: 1,
        prompt: 'Старая формулировка',
        options: [{ id: HISTORY_OPTION_ID, text: 'Старый вариант', correct: false }],
        replacedAt: '2026-08-20T09:00:00.000Z',
      },
    ],
    // imageIds — плоская копия для уборщика сирот (ADR-0035), в ExamItemDto
    // не отдаётся (toExamItemDto ниже маппит поля явно) — здесь только ради
    // типа LeanExamItem.
    imageIds: [],
    authorId: AUTHOR_ID,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  };
}

describe('toExamItemDto', () => {
  it('переносит все поля, id и даты — строками', () => {
    expect(toExamItemDto(fullItem())).toEqual({
      id: ITEM_ID.toString(),
      kind: 'single',
      prompt: 'Что означает «сюань»?',
      options: [{ id: OPTION_ID, text: 'Таинственный', correct: true }],
      status: 'published',
      version: 2,
      history: [
        {
          version: 1,
          prompt: 'Старая формулировка',
          options: [{ id: HISTORY_OPTION_ID, text: 'Старый вариант', correct: false }],
          replacedAt: '2026-08-20T09:00:00.000Z',
        },
      ],
      authorId: AUTHOR_ID.toString(),
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-02T11:00:00.000Z',
    });
  });

  it('отсутствующее optional-поле authorId — undefined, не null', () => {
    const doc = fullItem();
    doc.authorId = undefined;

    const dto = toExamItemDto(doc);

    expect(dto.authorId).toBeUndefined();
  });

  it('пустые варианты и история — пустые массивы', () => {
    const doc = fullItem();
    doc.options = [];
    doc.history = [];

    const dto = toExamItemDto(doc);

    expect(dto.options).toEqual([]);
    expect(dto.history).toEqual([]);
  });
});
