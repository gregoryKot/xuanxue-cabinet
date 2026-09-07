// Чистая логика, без Mongo и DI (CLAUDE.md «Тесты»).
import type { Message } from 'telegraf/types';
import { extractRecordingSource } from './recording-source';

function textMessage(text: string): Message {
  return { text } as unknown as Message;
}

describe('extractRecordingSource', () => {
  it('https-ссылка — url', () => {
    expect(extractRecordingSource(textMessage('https://youtu.be/abc'))).toEqual({
      url: 'https://youtu.be/abc',
    });
  });

  it('обычный текст — null', () => {
    expect(extractRecordingSource(textMessage('привет'))).toBeNull();
  });

  it('http (не https) — null: ссылка без шифрования не источник записи', () => {
    expect(extractRecordingSource(textMessage('http://youtu.be/abc'))).toBeNull();
  });

  it('ссылка не с начала строки — берёт первое совпадение, не только startsWith', () => {
    expect(extractRecordingSource(textMessage('вот запись https://youtu.be/x'))).toEqual({
      url: 'https://youtu.be/x',
    });
  });

  it('видео — telegramFileId', () => {
    const message = { video: { file_id: 'v1' } } as unknown as Message;
    expect(extractRecordingSource(message)).toEqual({ telegramFileId: 'v1' });
  });

  it('документ с video/* — telegramFileId', () => {
    const message = {
      document: { file_id: 'd1', mime_type: 'video/mp4' },
    } as unknown as Message;
    expect(extractRecordingSource(message)).toEqual({ telegramFileId: 'd1' });
  });

  it('документ не video/* — null', () => {
    const message = {
      document: { file_id: 'd2', mime_type: 'application/pdf' },
    } as unknown as Message;
    expect(extractRecordingSource(message)).toBeNull();
  });

  it('документ без mime_type — null', () => {
    const message = { document: { file_id: 'd3' } } as unknown as Message;
    expect(extractRecordingSource(message)).toBeNull();
  });

  it('нет сообщения — null', () => {
    expect(extractRecordingSource(undefined)).toBeNull();
  });

  it('стикер — null', () => {
    const message = { sticker: { file_id: 's1' } } as unknown as Message;
    expect(extractRecordingSource(message)).toBeNull();
  });
});
