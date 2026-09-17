// Храповик редакции query в логах (CLAUDE.md «Логи и наблюдаемость», SECURITY
// §2): код ссылки-приглашения и токен входа не должны попадать в req.url.
import { IncomingMessage } from 'http';
import { Socket } from 'net';
import pino from 'pino';
import { REDACT_PATHS } from './redact-paths';
import {
  REDACTED_VALUE,
  redactQueryValues,
  redactRequestSerializer,
} from './request-serializer';

class MemoryStream {
  chunks: string[] = [];
  write(chunk: string): boolean {
    this.chunks.push(chunk);
    return true;
  }
}

describe('redactQueryValues', () => {
  it('без query — строка не меняется', () => {
    expect(redactQueryValues('/api/auth/telegram', ['join'])).toBe('/api/auth/telegram');
  });

  it('параметр без значения — имя остаётся, значение проставляется редактированным', () => {
    expect(redactQueryValues('/x?join&y=1', ['join'])).toBe(
      `/x?join=${REDACTED_VALUE}&y=1`,
    );
  });

  it('два секретных параметра редактируются, остальные — нет', () => {
    const code = 'a'.repeat(32);
    const token = 'b'.repeat(64);
    const url = `/api/auth/telegram?join=${code}&token=${token}&x=1`;
    expect(redactQueryValues(url, ['join', 'token'])).toBe(
      `/api/auth/telegram?join=${REDACTED_VALUE}&token=${REDACTED_VALUE}&x=1`,
    );
  });

  it('регистр имени параметра не меняется — сравнение точное, чужой регистр не редактируется', () => {
    const url = '/x?Join=' + 'a'.repeat(10);
    expect(redactQueryValues(url, ['join'])).toBe(url);
  });
});

describe('redactRequestSerializer', () => {
  function buildIncomingMessage(url: string): IncomingMessage {
    const req = new IncomingMessage(new Socket());
    req.method = 'POST';
    req.url = url;
    req.headers = {};
    return req;
  }

  it('вырезает join и token из url, остальные параметры оставляет', () => {
    const code = 'a'.repeat(32);
    const url = `/api/auth/telegram?join=${code}&x=1`;
    const serialized = redactRequestSerializer(buildIncomingMessage(url));

    expect(serialized.url).not.toContain(code);
    expect(serialized.url).toContain(`join=${REDACTED_VALUE}`);
    expect(serialized.url).toContain('x=1');
  });

  // Ключевой критерий ревью: строка лога с ?join=<код> не содержит сам код —
  // ни в url, ни в разобранном req.query (его редактирует REDACT_PATHS).
  it('в реальном логе pino код приглашения не встречается нигде в строке', () => {
    const code = 'c'.repeat(32);
    const stream = new MemoryStream();
    const logger = pino(
      {
        redact: { paths: REDACT_PATHS, censor: REDACTED_VALUE },
        serializers: { req: redactRequestSerializer },
      },
      stream,
    );

    logger.info(
      {
        req: {
          method: 'POST',
          url: `/api/auth/telegram?join=${code}&x=1`,
          headers: {},
          query: { join: code, x: '1' },
        },
      },
      'проверка редакции query',
    );

    const line = stream.chunks.join('');
    expect(line).not.toContain(code);
    expect(line).toContain(`join=${REDACTED_VALUE}`);
  });
});
