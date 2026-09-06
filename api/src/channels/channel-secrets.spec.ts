import { scrubChannelSecrets } from './channel-secrets';

describe('scrubChannelSecrets', () => {
  it('вырезает токен ВК из config.token', () => {
    const text = 'ВК ответил ошибкой: access denied for token abc123secret';
    const out = scrubChannelSecrets(text, { token: 'abc123secret', peerId: 1 });

    expect(out).not.toContain('abc123secret');
    expect(out).toContain('[секрет]');
  });

  it('вырезает BOT_TOKEN, встреченный в URL Telegram', () => {
    const text =
      'запрос к https://api.telegram.org/bot123456:AAExampleToken/sendMessage упал';
    const out = scrubChannelSecrets(text, { chatId: '@school' }, '123456:AAExampleToken');

    expect(out).not.toContain('123456:AAExampleToken');
    expect(out).toContain('[секрет]');
  });

  it('вырезает access_token= в произвольной query-строке', () => {
    const text = 'GET /method/messages.send?access_token=vk1.a.zzz&peer_id=1 → 403';
    const out = scrubChannelSecrets(text, {});

    expect(out).not.toContain('vk1.a.zzz');
    expect(out).toContain('access_token=[секрет]');
  });

  it('не трогает текст без секретов', () => {
    const text = 'Бот не является администратором канала';
    expect(scrubChannelSecrets(text, { chatId: '@school' })).toBe(text);
  });

  it('manual-конфиг без token — botToken всё равно вырезается', () => {
    const text = 'ошибка с токеном secret42 внутри';
    expect(scrubChannelSecrets(text, {}, 'secret42')).not.toContain('secret42');
  });
});
