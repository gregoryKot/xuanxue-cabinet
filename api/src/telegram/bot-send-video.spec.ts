// Чистая проверка сборки запроса — без сети (CLAUDE.md «Тесты»), тот же
// приём, что bot-send.spec.ts: подменён bot.telegram.callApi
// (test-support/fake-call-api-bot.ts).
import { sendBotExamVideo } from './bot-send-video';
import { fakeCallApiBot } from './test-support/fake-call-api-bot';

describe('sendBotExamVideo', () => {
  it('video — sendVideo с полем video', async () => {
    const { bot, calls } = fakeCallApiBot();

    await sendBotExamVideo(bot, '111', 'file-1', 'video');

    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe('sendVideo');
    expect(calls[0]?.[1]).toEqual({ chat_id: '111', video: 'file-1' });
  });

  it('video_note — sendVideoNote с полем video_note', async () => {
    const { bot, calls } = fakeCallApiBot();

    await sendBotExamVideo(bot, '111', 'file-2', 'video_note');

    expect(calls[0]?.[0]).toBe('sendVideoNote');
    expect(calls[0]?.[1]).toEqual({ chat_id: '111', video_note: 'file-2' });
  });

  it('document — sendDocument с полем document', async () => {
    const { bot, calls } = fakeCallApiBot();

    await sendBotExamVideo(bot, '111', 'file-3', 'document');

    expect(calls[0]?.[0]).toBe('sendDocument');
    expect(calls[0]?.[1]).toEqual({ chat_id: '111', document: 'file-3' });
  });
});
