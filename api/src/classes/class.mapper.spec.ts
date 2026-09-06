import { Types } from 'mongoose';
import { toClassDto, type LeanClass } from './class.mapper';

const RULE_ID = new Types.ObjectId();
const CLASS_ID = new Types.ObjectId();
const LEADER_ID = new Types.ObjectId();
const CHANNEL_ID = new Types.ObjectId();
const CREATED_AT = new Date(Date.UTC(2026, 8, 1, 10, 0, 0));
const UPDATED_AT = new Date(Date.UTC(2026, 8, 2, 11, 0, 0));

function fullClass(): LeanClass {
  return {
    _id: CLASS_ID,
    title: 'Тайцзицюань',
    groupLabel: 'средняя группа',
    format: 'online',
    location: 'зал школы',
    zoomLink: 'https://us02web.zoom.us/j/123',
    zoomPassword: '1111',
    leaderId: LEADER_ID,
    rules: [{ _id: RULE_ID, weekday: 1, time: '19:00', durationMin: 60 }],
    tz: 'Asia/Jerusalem',
    channelIds: [CHANNEL_ID],
    leadMinutes: 30,
    active: true,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  };
}

describe('toClassDto', () => {
  it('переносит все поля, id и даты — строками', () => {
    expect(toClassDto(fullClass())).toEqual({
      id: CLASS_ID.toString(),
      title: 'Тайцзицюань',
      groupLabel: 'средняя группа',
      format: 'online',
      location: 'зал школы',
      zoomLink: 'https://us02web.zoom.us/j/123',
      zoomPassword: '1111',
      leaderId: LEADER_ID.toString(),
      rules: [{ id: RULE_ID.toString(), weekday: 1, time: '19:00', durationMin: 60 }],
      tz: 'Asia/Jerusalem',
      channelIds: [CHANNEL_ID.toString()],
      leadMinutes: 30,
      active: true,
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-02T11:00:00.000Z',
    });
  });

  it('отсутствующие optional-поля — undefined, не null', () => {
    const doc = fullClass();
    doc.location = undefined;
    doc.zoomLink = undefined;
    doc.zoomPassword = undefined;
    doc.leaderId = undefined;

    const dto = toClassDto(doc);

    expect(dto.location).toBeUndefined();
    expect(dto.zoomLink).toBeUndefined();
    expect(dto.zoomPassword).toBeUndefined();
    expect(dto.leaderId).toBeUndefined();
    expect('location' in dto).toBe(true); // ключ есть, просто пуст — не удалён
  });

  it('пустой список правил и каналов — пустые массивы', () => {
    const doc = fullClass();
    doc.rules = [];
    doc.channelIds = [];

    const dto = toClassDto(doc);

    expect(dto.rules).toEqual([]);
    expect(dto.channelIds).toEqual([]);
  });
});
