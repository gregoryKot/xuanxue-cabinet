import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import pino from 'pino';
import { pinoHttp } from 'pino-http';
import {
  buildPinoHttpOptions,
  renameReservedLogKeys,
  requestLogLevel,
} from './logging.module';
import { redactRequestSerializer } from './request-serializer';

describe('buildPinoHttpOptions', () => {
  it('development: включает pino-pretty', () => {
    const options = buildPinoHttpOptions('development', 'debug');
    expect(options.transport).toMatchObject({ target: 'pino-pretty' });
    expect(options.level).toBe('debug');
  });

  it('production: без транспорта — чистый JSON в stdout', () => {
    const options = buildPinoHttpOptions('production', 'info');
    expect(options.transport).toBeUndefined();
  });

  it('test: без транспорта — pino-pretty поднимает воркер-поток, лишний в e2e', () => {
    const options = buildPinoHttpOptions('test', 'info');
    expect(options.transport).toBeUndefined();
  });

  it('autoLogging.ignore отфильтровывает только /api/health', () => {
    const options = buildPinoHttpOptions('production', 'info');
    const ignore = (options.autoLogging as { ignore: (req: { url: string }) => boolean })
      .ignore;
    expect(ignore({ url: '/api/health' })).toBe(true);
    expect(ignore({ url: '/api/health?x=1' })).toBe(true);
    expect(ignore({ url: '/api/classes' })).toBe(false);
  });

  // Поведение самого редактирования url — в request-serializer.spec.ts;
  // здесь только проверка, что buildPinoHttpOptions его подключает и не даёт
  // pino-http обернуть ещё раз (см. комментарий у wrapSerializers в module).
  it('подключает redactRequestSerializer и выключает повторную обёртку pino-http', () => {
    const options = buildPinoHttpOptions('production', 'info');
    expect(options.serializers?.req).toBe(redactRequestSerializer);
    expect(options.wrapSerializers).toBe(false);
  });
});

// Регрессия: 23–26.09.2026 четыре алёрта «Сбой в браузере» (requestId
// 5addec59-d6aa-4440-a9c1-5aa06ba469aa, ed7b3bac-37bb-4114-be54-1964153aaa3d,
// 9e47b860-f5a5-4dd9-a06b-42da4c3a51e3, 9a5ef539-9911-465a-981f-8dc85796187f)
// пришли без текста: поле `message` Railway затёр текстом строки, а
// `level: 50` показал как INFO. Строка проверяется так, как её пишет pino.
describe('строка лога в разборе Railway', () => {
  function writeLine(
    fields: Record<string, unknown>,
    msg: string,
  ): Record<string, unknown> {
    const { formatters } = buildPinoHttpOptions('production', 'info');
    const lines: string[] = [];
    const logger = pino({ formatters }, { write: (line: string) => lines.push(line) });
    logger.error(fields, msg);
    return JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
  }

  it('уровень — словом, его понимает фильтр @level:error', () => {
    expect(writeLine({}, 'x').level).toBe('error');
  });

  it('поле message не теряется — переезжает в detail, msg остаётся текстом строки', () => {
    const line = writeLine(
      { requestId: 'r', message: 'TypeError: x is undefined' },
      'Сбой',
    );
    expect(line).not.toHaveProperty('message');
    expect(line.detail).toBe('TypeError: x is undefined');
    expect(line.msg).toBe('Сбой');
    expect(line.requestId).toBe('r');
  });

  it('объект без message не трогается', () => {
    const fields = { requestId: 'r' };
    expect(renameReservedLogKeys(fields)).toBe(fields);
  });
});

// Аудит 2026-10-01, F38: шторм 429/409 и 5xx писался на info, и фильтр по
// уровню в Railway его не показывал.
describe('requestLogLevel', () => {
  it.each([
    [500, 'error'],
    [503, 'error'],
    [429, 'warn'],
    [409, 'warn'],
    [200, 'info'],
    [404, 'info'],
    [400, 'info'],
  ])('статус %d → %s', (status, level) => {
    expect(requestLogLevel(status)).toBe(level);
  });

  it('ошибка запроса — error независимо от статуса', () => {
    expect(requestLogLevel(200, new Error('x'))).toBe('error');
  });

  it('подключён к pino-http как customLogLevel', () => {
    const options = buildPinoHttpOptions('production', 'info');
    const level = options.customLogLevel as (
      req: unknown,
      res: { statusCode: number },
      err?: Error,
    ) => string;
    expect(level({}, { statusCode: 429 })).toBe('warn');
    expect(level({}, { statusCode: 500 })).toBe('error');
    expect(level({}, { statusCode: 201 })).toBe('info');
  });
});

// Регрессия инцидента 2026-10-03: с 2026-09-17 (aa825a65) `wrapSerializers: false`
// без сериализатора `res` заставлял pino писать в «request completed» сырой
// ServerResponse — res.req.rawHeaders с cookie сессии, res.req.body целиком,
// _header, client. Проверка идёт на настоящем pino-http и настоящем HTTP-запросе:
// тест на одни опции пропустил бы ровно такой сбой.
describe('строка «request completed» в production', () => {
  const SECRET_COOKIE = 'SECRET_COOKIE_VALUE';
  const SECRET_AUTH = 'SECRET_AUTH_VALUE';
  const SECRET_BODY = 'SECRET_BODY_VALUE';
  const SECRET_SET_COOKIE = 'SECRET_SET_COOKIE_VALUE';

  let server: Server | undefined;

  afterEach(async () => {
    const running = server;
    server = undefined;
    if (!running) return;
    await new Promise<void>((resolve) => running.close(() => resolve()));
  });

  async function requestLine(statusCode: number, withError = false): Promise<string> {
    const lines: string[] = [];
    const logger = pinoHttp(buildPinoHttpOptions('production', 'info'), {
      write: (line: string) => lines.push(line),
    });
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        // Nest/express кладут разобранное тело в req.body — так оно и попадало
        // в сырой res.req.
        (req as unknown as { body: unknown }).body = JSON.parse(
          Buffer.concat(chunks).toString('utf8'),
        );
        logger(req, res);
        if (withError) (res as unknown as { err: Error }).err = new Error('boom');
        res.setHeader('set-cookie', `session=${SECRET_SET_COOKIE}; HttpOnly`);
        res.statusCode = statusCode;
        res.end('{}');
      });
    });
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/api/anything`, {
      method: 'POST',
      headers: {
        cookie: `session=${SECRET_COOKIE}`,
        authorization: `Bearer ${SECRET_AUTH}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ note: SECRET_BODY }),
    });
    await response.text();
    // pino-http пишет строку по событию finish — оно приходит чуть позже ответа.
    await new Promise<void>((resolve) => setImmediate(resolve));
    const line = lines.find((l) => l.includes('"msg":"request'));
    if (!line) throw new Error(`нет строки request completed: ${lines.join('|')}`);
    return line;
  }

  function expectNoLeak(line: string): void {
    for (const secret of [SECRET_COOKIE, SECRET_AUTH, SECRET_BODY, SECRET_SET_COOKIE]) {
      expect(line).not.toContain(secret);
    }
    expect(line).not.toContain('rawHeaders');
    expect(line).not.toContain('_header');
  }

  it('успешный ответ: статус есть, cookie, заголовки и тело запроса — нет', async () => {
    const line = await requestLine(200);
    const parsed = JSON.parse(line) as { msg: string; res: { statusCode: number } };
    expect(parsed.msg).toBe('request completed');
    expect(parsed.res.statusCode).toBe(200);
    expectNoLeak(line);
  });

  it('ответ 500: в err нет сырого req, cookie и тела запроса', async () => {
    const line = await requestLine(500);
    const parsed = JSON.parse(line) as { res: { statusCode: number }; err: unknown };
    expect(parsed.res.statusCode).toBe(500);
    expect(parsed.err).toBeDefined();
    expectNoLeak(line);
  });

  it('ошибка на res.err: сериализуется как Error, без сырого req', async () => {
    const line = await requestLine(200, true);
    const parsed = JSON.parse(line) as { err: { message: string } };
    expect(parsed.err.message).toBe('boom');
    expectNoLeak(line);
  });
});
