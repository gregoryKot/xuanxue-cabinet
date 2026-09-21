// Минимальный фейк Telegraf для проверки сборки запроса — без сети (CLAUDE.md
// «Тесты»). Отдельно от telegraf-factory.ts: там настоящий Telegraf с
// маршрутизацией апдейтов (используют e2e и хендлеры), здесь — только форма
// `{ telegram: { callApi } }`, которой хватает низкоуровневым отправщикам
// (bot-send.ts, bot-send-video.ts). Общий помощник — CLAUDE.md «Одна механика
// — один компонент»: bot-send.spec.ts и bot-send-video.spec.ts проверяют
// разные функции, но одинаково перехватывают callApi.
import type { Telegraf } from 'telegraf';

export interface FakeCallApiBot {
  bot: Telegraf;
  calls: [string, Record<string, unknown>][];
}

export function fakeCallApiBot(): FakeCallApiBot {
  const calls: [string, Record<string, unknown>][] = [];
  const bot = {
    telegram: {
      callApi: (method: string, payload: Record<string, unknown>) => {
        calls.push([method, payload]);
        return Promise.resolve(true);
      },
    },
  } as unknown as Telegraf;
  return { bot, calls };
}
