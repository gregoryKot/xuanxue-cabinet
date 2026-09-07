// Проверяет, что REDACT_PATHS реально срабатывает в pino, а не просто
// существует как список строк — храповик редакции логов (CLAUDE.md
// «Безопасность»). Пишем в буфер в памяти вместо файла/stdout.
import pino from 'pino';
import { REDACT_PATHS } from './redact-paths';

class MemoryStream {
  chunks: string[] = [];
  write(chunk: string): boolean {
    this.chunks.push(chunk);
    return true;
  }
}

function logSample(): Record<string, unknown> {
  const stream = new MemoryStream();
  const logger = pino({ redact: { paths: REDACT_PATHS, censor: '[Redacted]' } }, stream);
  logger.info(
    {
      req: {
        headers: {
          authorization: 'Bearer secret',
          cookie: 'sid=1',
          'x-telegram-bot-api-secret-token': 'webhook-secret',
        },
        body: { email: 'user@example.com', name: 'Мария', hash: 'a'.repeat(64) },
      },
      res: {
        headers: {
          'set-cookie': 'session=tok; HttpOnly',
          'content-type': 'application/json',
        },
      },
      user: {
        token: 't',
        accessToken: 'at',
        refreshToken: 'rt',
        secret: 's',
        name: 'Мария',
        email: 'maria@example.com',
        telegramId: 12345,
      },
      vk: {
        access_token: 'vk1.a.secret',
        peer_id: 2000000001,
      },
      channel: {
        config: { apiKey: 'k' },
        zoomLink: 'https://zoom.example/1',
        zoomPassword: 'pw',
        title: 'Средняя группа',
      },
      lesson: {
        zoomLinkOverride: 'https://zoom.example/2',
        zoomPasswordOverride: '2222',
        note: 'заметка учителя',
        topic: 'пятое занятие',
      },
      broadcast: {
        text: 'ссылка https://zoom.example/2 пароль 1111',
        kind: 'lesson_link',
      },
    },
    'проверка редакции',
  );
  return JSON.parse(stream.chunks.join('')) as Record<string, unknown>;
}

describe('REDACT_PATHS', () => {
  it('вырезает секреты заголовков, тела и вложенных объектов', () => {
    const logged = logSample();
    const req = logged.req as Record<string, unknown>;
    const headers = req.headers as Record<string, unknown>;
    const body = req.body as Record<string, unknown>;
    const res = logged.res as Record<string, unknown>;
    const resHeaders = res.headers as Record<string, unknown>;
    const user = logged.user as Record<string, unknown>;
    const channel = logged.channel as Record<string, unknown>;
    const lesson = logged.lesson as Record<string, unknown>;
    const broadcast = logged.broadcast as Record<string, unknown>;
    const vk = logged.vk as Record<string, unknown>;

    expect(headers.authorization).toBe('[Redacted]');
    expect(headers.cookie).toBe('[Redacted]');
    expect(headers['x-telegram-bot-api-secret-token']).toBe('[Redacted]');
    expect(body.email).toBe('[Redacted]');
    expect(body.hash).toBe('[Redacted]');
    expect(resHeaders['set-cookie']).toBe('[Redacted]');
    expect(user.token).toBe('[Redacted]');
    expect(user.accessToken).toBe('[Redacted]');
    expect(user.refreshToken).toBe('[Redacted]');
    expect(user.secret).toBe('[Redacted]');
    expect(user.email).toBe('[Redacted]');
    expect(user.telegramId).toBe('[Redacted]');
    expect(channel.config).toBe('[Redacted]');
    expect(vk.access_token).toBe('[Redacted]');
    expect(channel.zoomLink).toBe('[Redacted]');
    expect(channel.zoomPassword).toBe('[Redacted]');
    expect(lesson.zoomLinkOverride).toBe('[Redacted]');
    expect(lesson.zoomPasswordOverride).toBe('[Redacted]');
    expect(lesson.note).toBe('[Redacted]');
    expect(broadcast.text).toBe('[Redacted]');
  });

  it('не трогает соседние не-секретные поля', () => {
    const logged = logSample();
    const req = logged.req as Record<string, unknown>;
    const body = req.body as Record<string, unknown>;
    const res = logged.res as Record<string, unknown>;
    const resHeaders = res.headers as Record<string, unknown>;
    const user = logged.user as Record<string, unknown>;
    const channel = logged.channel as Record<string, unknown>;
    const lesson = logged.lesson as Record<string, unknown>;
    const broadcast = logged.broadcast as Record<string, unknown>;
    const vk = logged.vk as Record<string, unknown>;

    expect(resHeaders['content-type']).toBe('application/json');
    expect(vk.peer_id).toBe(2000000001);
    expect(body.name).toBe('Мария');
    expect(user.name).toBe('Мария');
    expect(channel.title).toBe('Средняя группа');
    expect(lesson.topic).toBe('пятое занятие');
    expect(broadcast.kind).toBe('lesson_link');
  });
});
