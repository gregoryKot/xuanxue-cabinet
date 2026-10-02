// Юнит на чистую функцию без сети и без DI (CLAUDE.md «Тесты»). Прогрев
// botInfo и setWebhook покрыты через фейковую фабрику в
// telegram-bot.service.spec.ts.
import { updateErrorLogLine } from './bot-startup';

describe('updateErrorLogLine', () => {
  // Аудит 2026-10-01, F52: в логах Railway «Telegram молчит» (истёк
  // handlerTimeout) и падение хендлера должны искаться разными строками.
  it('TimeoutError от handlerTimeout помечается telegram.update.timeout', () => {
    const err = Object.assign(new Error('Promise timed out after 30000 milliseconds'), {
      name: 'TimeoutError',
    });
    expect(updateErrorLogLine(err)).toBe(
      'telegram.update.timeout: Promise timed out after 30000 milliseconds',
    );
  });

  it('обычная ошибка хендлера — telegram.update с её текстом', () => {
    expect(updateErrorLogLine(new Error('boom'))).toBe('telegram.update: boom');
  });

  it('не-Error (строка) — тот же префикс, текст через String()', () => {
    expect(updateErrorLogLine('упало')).toBe('telegram.update: упало');
  });
});
