// Отправка одного видео (2026-09-27, «Уточнено» ADR-0133) — файл-лимит увёл
// эти сценарии из exam-question-album.spec.ts (там — общий порядок и
// questionVideoFailed), здесь — сам механизм: file_id/bytes, кэш, деградация.
// Тот же образец, что у картинки (было в exam-question-album.spec.ts до
// разделения).
import { Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import type { UserLean } from '../../users/users.service';
import { fakeExamBotPort } from '../exam-bot.port.test-support';
import type { VideoAlbumEntry } from './exam-question-album';
import { sendOptionVideo } from './exam-question-video-send';

const ATTEMPT_ID = '507f1f77bcf86cd799439011';
const CHAT_ID = 111;
const NOW = DateTime.utc(2026, 9, 27, 10, 0, 0);
const USER: UserLean = {
  id: 'u1',
  name: 'Ученик',
  roles: [],
  status: 'active',
  studentMode: false,
};
const BYTES = Buffer.from([1, 2, 3]);

/** Байты — лениво (аудит 2026-10-01, F02): фейк считает, сколько раз их
 * прочитали, — с известным file_id ни разу. Новый объект на тест: jest.Mock
 * внутри общей константы копил бы вызовы между тестами. */
function video(telegramFileId?: string): {
  loadBytes: jest.Mock<Promise<Buffer>, []>;
  contentType: 'video/mp4';
  telegramFileId?: string;
} {
  return {
    loadBytes: jest.fn<Promise<Buffer>, []>().mockResolvedValue(BYTES),
    contentType: 'video/mp4',
    ...(telegramFileId ? { telegramFileId } : {}),
  };
}

function optionEntry(overrides: Partial<VideoAlbumEntry> = {}): VideoAlbumEntry {
  return {
    kind: 'video',
    videoId: 'vid-1',
    optionIndex: 0,
    caption: 'Вариант 1',
    ...overrides,
  };
}

function fakeCtx(): { ctx: Context; sendVideo: jest.Mock; sendMessage: jest.Mock } {
  const sendVideo = jest
    .fn()
    .mockResolvedValue({ message_id: 1, video: { file_id: 'v-1' } });
  const sendMessage = jest.fn().mockResolvedValue({ message_id: 1 });
  const ctx = { telegram: { sendVideo, sendMessage } } as unknown as Context;
  return { ctx, sendVideo, sendMessage };
}

describe('sendOptionVideo', () => {
  it('видео байтами — sendVideo с InputFile и подписью, file_id запоминается', async () => {
    const { ctx, sendVideo } = fakeCtx();
    const loaded = video();
    const port = fakeExamBotPort({
      loadOptionVideo: jest.fn().mockResolvedValue(loaded),
    });
    const entry = optionEntry();

    const sent = await sendOptionVideo(ctx, port, USER, CHAT_ID, entry, ATTEMPT_ID, NOW);

    expect(sent).toBe(true);
    const [chatId, media, extra] = sendVideo.mock.calls[0] as [
      number,
      { source: Buffer; filename: string },
      { caption: string },
    ];
    expect(chatId).toBe(CHAT_ID);
    expect(media.source).toBe(BYTES);
    expect(media.filename).toBe('variant-1.mp4');
    expect(extra.caption).toBe('Вариант 1');
    expect(port.rememberVideoFileId).toHaveBeenCalledWith('vid-1', 'v-1');
    expect(loaded.loadBytes).toHaveBeenCalledTimes(1); // без file_id — ровно одно чтение
  });

  it('видео вопроса (без optionIndex/caption) — имя файла question.*, без caption', async () => {
    const { ctx, sendVideo } = fakeCtx();
    const port = fakeExamBotPort({
      loadOptionVideo: jest.fn().mockResolvedValue(video()),
    });
    const entry: VideoAlbumEntry = { kind: 'video', videoId: 'own-1' };

    await sendOptionVideo(ctx, port, USER, CHAT_ID, entry, ATTEMPT_ID, NOW);

    const [, media, extra] = sendVideo.mock.calls[0] as [
      number,
      { filename: string },
      Record<string, unknown>,
    ];
    expect(media.filename).toBe('question.mp4');
    expect(extra.caption).toBeUndefined();
  });

  // Аудит 2026-10-01 (F02): с известным file_id объект R2 в память не ложится.
  it('известный file_id — шлётся строкой, байты не читаются, повторно не запоминается', async () => {
    const { ctx, sendVideo } = fakeCtx();
    const loaded = video('known-id');
    const port = fakeExamBotPort({
      loadOptionVideo: jest.fn().mockResolvedValue(loaded),
    });

    const sent = await sendOptionVideo(
      ctx,
      port,
      USER,
      CHAT_ID,
      optionEntry(),
      ATTEMPT_ID,
      NOW,
    );

    expect(sent).toBe(true);
    const [, media] = sendVideo.mock.calls[0] as [number, string, unknown];
    expect(media).toBe('known-id');
    expect(port.rememberVideoFileId).not.toHaveBeenCalled();
    expect(loaded.loadBytes).not.toHaveBeenCalled();
  });

  it('Telegram отверг известный file_id — повтор байтами, file_id перезаписан', async () => {
    const { ctx, sendVideo } = fakeCtx();
    sendVideo
      .mockRejectedValueOnce(new Error('wrong file_id'))
      .mockResolvedValueOnce({ message_id: 2, video: { file_id: 'v-new' } });
    const loaded = video('stale-id');
    const port = fakeExamBotPort({
      loadOptionVideo: jest.fn().mockResolvedValue(loaded),
    });

    const sent = await sendOptionVideo(
      ctx,
      port,
      USER,
      CHAT_ID,
      optionEntry(),
      ATTEMPT_ID,
      NOW,
    );

    expect(sent).toBe(true);
    expect(sendVideo).toHaveBeenCalledTimes(2);
    const [, secondMedia] = sendVideo.mock.calls[1] as [
      number,
      { source: Buffer },
      unknown,
    ];
    expect(secondMedia.source).toBe(BYTES);
    expect(port.rememberVideoFileId).toHaveBeenCalledWith('vid-1', 'v-new');
    expect(loaded.loadBytes).toHaveBeenCalledTimes(1); // байты — только после отказа
  });

  it('байты не читаются (R2 выключен, объект пропал) — false, warn, без исключения', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { ctx, sendVideo } = fakeCtx();
    const loaded = video();
    loaded.loadBytes.mockRejectedValue(new Error('R2 выключен'));
    const port = fakeExamBotPort({
      loadOptionVideo: jest.fn().mockResolvedValue(loaded),
    });

    const sent = await sendOptionVideo(
      ctx,
      port,
      USER,
      CHAT_ID,
      optionEntry(),
      ATTEMPT_ID,
      NOW,
    );

    expect(sent).toBe(false);
    expect(sendVideo).not.toHaveBeenCalled();
    expect(port.rememberVideoFileId).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('сбой отправки'),
      expect.objectContaining({ videoId: 'vid-1' }),
    );
    warn.mockRestore();
  });

  it('полный сбой отправки (без кэша file_id) — false, warn, без исключения', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { ctx, sendVideo } = fakeCtx();
    sendVideo.mockRejectedValue(new Error('сеть недоступна'));
    const port = fakeExamBotPort({
      loadOptionVideo: jest.fn().mockResolvedValue(video()),
    });

    const sent = await sendOptionVideo(
      ctx,
      port,
      USER,
      CHAT_ID,
      optionEntry(),
      ATTEMPT_ID,
      NOW,
    );

    expect(sent).toBe(false);
    expect(warn).toHaveBeenCalled();
    expect(port.rememberVideoFileId).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('записи нет или не своё (порт вернул null) — false, warn, без исключения', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { ctx, sendVideo } = fakeCtx();
    const port = fakeExamBotPort({ loadOptionVideo: jest.fn().mockResolvedValue(null) });

    const sent = await sendOptionVideo(
      ctx,
      port,
      USER,
      CHAT_ID,
      optionEntry(),
      ATTEMPT_ID,
      NOW,
    );

    expect(sent).toBe(false);
    expect(sendVideo).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('сбой чтения (порт бросил) — false, warn, без исключения и без отправки', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { ctx, sendVideo } = fakeCtx();
    const port = fakeExamBotPort({
      loadOptionVideo: jest.fn().mockRejectedValue(new Error('mongo упал')),
    });

    const sent = await sendOptionVideo(
      ctx,
      port,
      USER,
      CHAT_ID,
      optionEntry(),
      ATTEMPT_ID,
      NOW,
    );

    expect(sent).toBe(false);
    expect(sendVideo).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
