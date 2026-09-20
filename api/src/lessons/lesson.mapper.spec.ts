import { Types } from 'mongoose';
import { toLessonDto, type LeanLesson } from './lesson.mapper';

const LESSON_ID = new Types.ObjectId();
const CLASS_ID = new Types.ObjectId();
const LEADER_ID = new Types.ObjectId();
const RULE_ID = new Types.ObjectId();
const RECORDING_ID = new Types.ObjectId();
const PLANNED_AT = new Date(Date.UTC(2026, 8, 8, 16, 0, 0));
const STARTS_AT = new Date(Date.UTC(2026, 8, 8, 16, 0, 0));
const CREATED_AT = new Date(Date.UTC(2026, 8, 1, 10, 0, 0));
const UPDATED_AT = new Date(Date.UTC(2026, 8, 2, 11, 0, 0));

function fullLesson(): LeanLesson {
  return {
    _id: LESSON_ID,
    classId: CLASS_ID,
    plannedAt: PLANNED_AT,
    startsAt: STARTS_AT,
    durationMin: 60,
    topic: 'Пятое занятие цикла «Шаги назад»',
    status: 'scheduled',
    leaderId: LEADER_ID,
    ruleId: RULE_ID,
    zoomLinkOverride: 'https://us02web.zoom.us/j/999',
    zoomPasswordOverride: '2222',
    recordings: [
      { _id: RECORDING_ID, title: 'Запись занятия', url: 'https://drive.example/rec' },
    ],
    note: 'Перенесли из-за праздника',
    tags: ['дракон', 'начинающие'],
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  };
}

describe('toLessonDto', () => {
  it('переносит все поля, id и даты — строками', () => {
    expect(toLessonDto(fullLesson())).toEqual({
      id: LESSON_ID.toString(),
      classId: CLASS_ID.toString(),
      plannedAt: '2026-09-08T16:00:00.000Z',
      startsAt: '2026-09-08T16:00:00.000Z',
      durationMin: 60,
      topic: 'Пятое занятие цикла «Шаги назад»',
      status: 'scheduled',
      leaderId: LEADER_ID.toString(),
      ruleId: RULE_ID.toString(),
      zoomLinkOverride: 'https://us02web.zoom.us/j/999',
      zoomPasswordOverride: '2222',
      recordings: [
        {
          id: RECORDING_ID.toString(),
          title: 'Запись занятия',
          url: 'https://drive.example/rec',
        },
      ],
      note: 'Перенесли из-за праздника',
      broadcast: undefined,
      tags: ['дракон', 'начинающие'],
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-02T11:00:00.000Z',
    });
  });

  it('передан статус рассылки ссылки — поле broadcast со status и kind', () => {
    const dto = toLessonDto(fullLesson(), 'sent');
    expect(dto.broadcast).toEqual({ status: 'sent', kind: 'lesson_link' });
  });

  it('статус рассылки не передан — поля broadcast в ответе нет', () => {
    const dto = toLessonDto(fullLesson());
    expect(dto.broadcast).toBeUndefined();
    expect(JSON.stringify(dto)).not.toContain('broadcast');
  });

  it('разовое занятие без необязательных полей — ключи отсутствуют, не мусор', () => {
    const doc = fullLesson();
    doc.plannedAt = undefined;
    doc.leaderId = undefined;
    doc.ruleId = undefined;
    doc.zoomLinkOverride = undefined;
    doc.zoomPasswordOverride = undefined;
    doc.note = undefined;
    doc.recordings = [];

    const dto = toLessonDto(doc);

    expect(dto).toEqual({
      id: LESSON_ID.toString(),
      classId: CLASS_ID.toString(),
      startsAt: '2026-09-08T16:00:00.000Z',
      durationMin: 60,
      topic: 'Пятое занятие цикла «Шаги назад»',
      status: 'scheduled',
      recordings: [],
      tags: ['дракон', 'начинающие'],
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-02T11:00:00.000Z',
    });
  });

  // Даты занятий, заведённые до ADR-0073, не имеют поля в документе —
  // `.lean()` не подставляет default схемы при чтении, маппер сам отдаёт [].
  it('документ без поля tags (дата до этого PR) — tags: []', () => {
    const { tags: _tags, ...doc } = fullLesson();

    const dto = toLessonDto(doc);

    expect(dto.tags).toEqual([]);
  });
});
