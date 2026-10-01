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
import type { VideoAlbumEntry, VideoLinkAlbumEntry } from './exam-question-album';
import { sendOptionVideo, sendVideoLink } from './exam-question-video-send';

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
const VIDEO = { bytes: Buffer.from([1, 2, 3]), contentType: 'video/mp4' as const };

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
    const port = fakeExamBotPort({ loadOptionVideo: jest.fn().mockResolvedValue(VIDEO) });
    const entry = optionEntry();

    const sent = await sendOptionVideo(ctx, port, USER, CHAT_ID, entry, ATTEMPT_ID, NOW);

    expect(sent).toBe(true);
    const [chatId, media, extra] = sendVideo.mock.calls[0] as [
      number,
      { source: Buffer; filename: string },
      { caption: string },
    ];
    expect(chatId).toBe(CHAT_ID);
    expect(media.source).toBe(VIDEO.bytes);
    expect(media.filename).toBe('variant-1.mp4');
    expect(extra.caption).toBe('Вариант 1');
    expect(port.rememberVideoFileId).toHaveBeenCalledWith('vid-1', 'v-1');
  });

  it('видео вопроса (без optionIndex/caption) — имя файла question.*, без caption', async () => {
    const { ctx, sendVideo } = fakeCtx();
    const port = fakeExamBotPort({ loadOptionVideo: jest.fn().mockResolvedValue(VIDEO) });
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

  it('известный file_id — шлётся строкой, не байтами, повторно не запоминается', async () => {
    const { ctx, sendVideo } = fakeCtx();
    const port = fakeExamBotPort({
      loadOptionVideo: jest
        .fn()
        .mockResolvedValue({ ...VIDEO, telegramFileId: 'known-id' }),
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
  });

  it('Telegram отверг известный file_id — повтор байтами, file_id перезаписан', async () => {
    const { ctx, sendVideo } = fakeCtx();
    sendVideo
      .mockRejectedValueOnce(new Error('wrong file_id'))
      .mockResolvedValueOnce({ message_id: 2, video: { file_id: 'v-new' } });
    const port = fakeExamBotPort({
      loadOptionVideo: jest
        .fn()
        .mockResolvedValue({ ...VIDEO, telegramFileId: 'stale-id' }),
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
    expect(secondMedia.source).toBe(VIDEO.bytes);
    expect(port.rememberVideoFileId).toHaveBeenCalledWith('vid-1', 'v-new');
  });

  it('полный сбой отправки (без кэша file_id) — false, warn, без исключения', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { ctx, sendVideo } = fakeCtx();
    sendVideo.mockRejectedValue(new Error('сеть недоступна'));
    const port = fakeExamBotPort({ loadOptionVideo: jest.fn().mockResolvedValue(VIDEO) });

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

  it('R2 выключен/объект пропал (порт вернул null) — false, warn, без исключения', async () => {
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

describe('sendVideoLink', () => {
  it('ссылка варианта — sendMessage с превью и префиксом', async () => {
    const { ctx, sendMessage } = fakeCtx();
    const entry: VideoLinkAlbumEntry = {
      kind: 'videoLink',
      url: 'https://youtu.be/x',
      optionIndex: 0,
      caption: 'Вариант 1',
    };

    await sendVideoLink(ctx, CHAT_ID, entry);

    expect(sendMessage).toHaveBeenCalledWith(CHAT_ID, 'Вариант 1: https://youtu.be/x', {
      link_preview_options: { is_disabled: false, url: 'https://youtu.be/x' },
    });
  });

  it('ссылка вопроса (без caption) — голой ссылкой', async () => {
    const { ctx, sendMessage } = fakeCtx();
    const entry: VideoLinkAlbumEntry = { kind: 'videoLink', url: 'https://youtu.be/own' };

    await sendVideoLink(ctx, CHAT_ID, entry);

    expect(sendMessage).toHaveBeenCalledWith(CHAT_ID, 'https://youtu.be/own', {
      link_preview_options: { is_disabled: false, url: 'https://youtu.be/own' },
    });
  });

  it('sendMessage упал — не бросает исключение', async () => {
    const { ctx, sendMessage } = fakeCtx();
    sendMessage.mockRejectedValue(new Error('сеть недоступна'));
    const entry: VideoLinkAlbumEntry = { kind: 'videoLink', url: 'https://youtu.be/own' };

    await expect(sendVideoLink(ctx, CHAT_ID, entry)).resolves.toBeUndefined();
  });
});
