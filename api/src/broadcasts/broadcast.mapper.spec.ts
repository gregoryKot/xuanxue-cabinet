import { Types } from 'mongoose';
import { toBroadcastDto, type LeanBroadcast } from './broadcast.mapper';

const BROADCAST_ID = new Types.ObjectId();
const LESSON_ID = new Types.ObjectId();
const CHANNEL_ID = new Types.ObjectId();
const CREATED_AT = new Date(Date.UTC(2026, 8, 1, 10, 0, 0));
const UPDATED_AT = new Date(Date.UTC(2026, 8, 2, 11, 0, 0));
const SCHEDULED_AT = new Date(Date.UTC(2026, 8, 6, 18, 30, 0));
const SENT_AT = new Date(Date.UTC(2026, 8, 6, 18, 31, 0));

function fullBroadcast(): LeanBroadcast {
  return {
    _id: BROADCAST_ID,
    kind: 'recording',
    status: 'sent',
    text: 'Занятие 5: https://drive.example/rec',
    scheduledAt: SCHEDULED_AT,
    sentAt: SENT_AT,
    lessonId: LESSON_ID,
    channelIds: [CHANNEL_ID],
    telegramFileId: 'BAADBAADrwADBREAAYag',
    recordingKey: 'https://drive.example/rec',
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  };
}

describe('toBroadcastDto', () => {
  it('переносит все поля, id и даты — строками', () => {
    expect(toBroadcastDto(fullBroadcast())).toEqual({
      id: BROADCAST_ID.toString(),
      kind: 'recording',
      status: 'sent',
      text: 'Занятие 5: https://drive.example/rec',
      scheduledAt: '2026-09-06T18:30:00.000Z',
      sentAt: '2026-09-06T18:31:00.000Z',
      lessonId: LESSON_ID.toString(),
      channelIds: [CHANNEL_ID.toString()],
      telegramFileId: 'BAADBAADrwADBREAAYag',
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-02T11:00:00.000Z',
    });
  });

  it('kind manual: telegramFileId/lessonId отсутствуют — undefined, не null; sentAt пока нет', () => {
    const doc = fullBroadcast();
    doc.kind = 'manual';
    doc.status = 'scheduled';
    doc.lessonId = undefined;
    doc.telegramFileId = undefined;
    doc.sentAt = undefined;

    const dto = toBroadcastDto(doc);

    expect(dto.lessonId).toBeUndefined();
    expect(dto.telegramFileId).toBeUndefined();
    expect(dto.sentAt).toBeUndefined();
    expect('telegramFileId' in dto).toBe(true); // ключ есть, просто пуст — не удалён
  });

  it('recordingKey — внутреннее поле, наружу в DTO не идёт', () => {
    const dto = toBroadcastDto(fullBroadcast()) as unknown as Record<string, unknown>;
    expect('recordingKey' in dto).toBe(false);
  });

  it('пустой channelIds — пустой массив', () => {
    const doc = fullBroadcast();
    doc.channelIds = [];

    expect(toBroadcastDto(doc).channelIds).toEqual([]);
  });
});
