// Юнит с фейковым ctx и фейковым SettingsService (CLAUDE.md «Тесты» —
// чистая логика, без Mongo и без сети, тот же приём, что
// payment-screenshot-deep-link.spec.ts): текст незнакомцу — ровно тот же,
// что строит buildStrangerMessage для /start, и сбой ctx.reply (человек
// заблокировал бота) наружу не падает.
import type { Context } from 'telegraf';
import type { SettingsService } from '../../settings/settings.service';
import { buildStrangerMessage } from './bot-menu';
import { replyStranger } from './stranger-reply';

function fakeCtx(): { ctx: Context; replies: string[] } {
  const replies: string[] = [];
  const ctx = {
    reply: (text: string) => {
      replies.push(text);
      return Promise.resolve();
    },
  } as unknown as Context;
  return { ctx, replies };
}

function fakeSettings(schoolSiteUrl?: string): SettingsService {
  return { get: () => Promise.resolve({ schoolSiteUrl }) } as unknown as SettingsService;
}

describe('replyStranger', () => {
  it('адрес сайта заполнен — тот же текст, что строит buildStrangerMessage для /start', async () => {
    const { ctx, replies } = fakeCtx();

    await replyStranger(ctx, fakeSettings('https://xuanxue.su'));

    expect(replies).toEqual([buildStrangerMessage('https://xuanxue.su')]);
  });

  it('адрес сайта не заполнен — базовый текст без ссылки', async () => {
    const { ctx, replies } = fakeCtx();

    await replyStranger(ctx, fakeSettings());

    expect(replies).toEqual([buildStrangerMessage()]);
  });

  it('ctx.reply падает (бот заблокирован) — не выбрасывается наружу', async () => {
    const ctx = {
      reply: () => Promise.reject(new Error('бот заблокирован')),
    } as unknown as Context;

    await expect(replyStranger(ctx, fakeSettings())).resolves.toBeUndefined();
  });
});
