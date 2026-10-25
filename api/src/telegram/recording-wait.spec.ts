// Чистые билдеры апдейта bot_sessions для «Запись?» — без Mongo и без DI.
import { DateTime } from 'luxon';
import { Types } from 'mongoose';
import {
  RECORDING_WAIT_HOURS,
  recordingSourceUpdate,
  recordingWaitUpdate,
} from './recording-wait';

const NOW = DateTime.fromISO('2026-09-06T18:00:00Z', { zone: 'utc' });

describe('recordingWaitUpdate', () => {
  it('заводит ожидание записи на занятие: вид, ObjectId, срок', () => {
    const lessonId = new Types.ObjectId().toString();

    const update = recordingWaitUpdate(lessonId, NOW);

    expect(update.kind).toBe('recording');
    expect(update.lessonId).toBeInstanceOf(Types.ObjectId);
    expect(update.lessonId.toString()).toBe(lessonId);
    expect(update.expiresAt).toEqual(
      NOW.plus({ hours: RECORDING_WAIT_HOURS }).toJSDate(),
    );
  });

  it('сбрасывает присланный раньше источник — null, а не пропуск поля', () => {
    const update = recordingWaitUpdate(new Types.ObjectId().toString(), NOW);

    expect(update.recordingUrl).toBeNull();
    expect(update.recordingFileId).toBeNull();
    expect(Object.keys(update)).toEqual(
      expect.arrayContaining(['recordingUrl', 'recordingFileId']),
    );
  });
});

describe('recordingSourceUpdate', () => {
  it('ссылка — recordingUrl, файл обнуляется', () => {
    expect(recordingSourceUpdate({ url: 'https://youtu.be/abc' })).toEqual({
      recordingUrl: 'https://youtu.be/abc',
      recordingFileId: null,
    });
  });

  it('видео в Telegram — recordingFileId, ссылка обнуляется', () => {
    expect(recordingSourceUpdate({ telegramFileId: 'file-1' })).toEqual({
      recordingUrl: null,
      recordingFileId: 'file-1',
    });
  });

  it('пустой источник — оба поля null, прошлый выбор не переживает', () => {
    expect(recordingSourceUpdate({})).toEqual({
      recordingUrl: null,
      recordingFileId: null,
    });
  });
});
