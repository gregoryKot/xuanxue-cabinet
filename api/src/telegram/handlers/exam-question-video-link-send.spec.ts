// Ссылка на видео отдельным сообщением с превью (2026-09-27, «Уточнено»
// ADR-0133) — тесты переехали из exam-question-video-send.spec.ts вместе с
// кодом (файл-лимит, F02).
import type { Context } from 'telegraf';
import type { VideoLinkAlbumEntry } from './exam-question-album';
import { sendVideoLink } from './exam-question-video-link-send';

const CHAT_ID = 111;

function fakeCtx(): { ctx: Context; sendMessage: jest.Mock } {
  const sendMessage = jest.fn().mockResolvedValue({ message_id: 1 });
  const ctx = { telegram: { sendMessage } } as unknown as Context;
  return { ctx, sendMessage };
}

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
