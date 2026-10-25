// Чистая логика, без Mongo и DI (CLAUDE.md «Тесты»): ключ рассылки записи и
// решение «есть ли что рассылать» (ADR-0180).
import { hasBroadcastableSource, recordingKeyOf } from './recording-key';

const VIDEO_ID = '507f1f77bcf86cd799439011';

describe('recordingKeyOf', () => {
  it('файл в кабинете главнее ссылки и file_id: одна запись — один пост', () => {
    expect(
      recordingKeyOf({
        title: 'Запись',
        url: 'https://youtu.be/abc',
        telegramFileId: 'file-1',
        videoId: VIDEO_ID,
      }),
    ).toBe(VIDEO_ID);
  });

  it('запись без videoId (все записи до ADR-0180) — ключ прежний: url, затем file_id', () => {
    expect(recordingKeyOf({ title: 'a', url: 'https://youtu.be/abc' })).toBe(
      'https://youtu.be/abc',
    );
    expect(recordingKeyOf({ title: 'a', telegramFileId: 'file-1' })).toBe('file-1');
  });
});

describe('hasBroadcastableSource', () => {
  it('только videoId — рассылать нечем: пост вышел бы без ссылки и без видео', () => {
    expect(hasBroadcastableSource({ title: 'Запись', videoId: VIDEO_ID })).toBe(false);
  });

  it('videoId вместе со ссылкой или с file_id — рассылаем', () => {
    expect(
      hasBroadcastableSource({
        title: 'a',
        videoId: VIDEO_ID,
        url: 'https://youtu.be/a',
      }),
    ).toBe(true);
    expect(
      hasBroadcastableSource({ title: 'a', videoId: VIDEO_ID, telegramFileId: 'f' }),
    ).toBe(true);
  });

  it('прежние записи: ссылка или file_id — рассылаем', () => {
    expect(hasBroadcastableSource({ title: 'a', url: 'https://youtu.be/a' })).toBe(true);
    expect(hasBroadcastableSource({ title: 'a', telegramFileId: 'f' })).toBe(true);
  });
});
