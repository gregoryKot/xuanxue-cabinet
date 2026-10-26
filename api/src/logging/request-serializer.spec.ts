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

describe('redactQueryValues — вход через Google (ADR-0145)', () => {
  it('code и state из /login/google?code=…&state=… редактируются', () => {
    const code = 'g'.repeat(20);
    const state = 'h'.repeat(43);
    const url = `/login/google?code=${code}&state=${state}`;
    expect(redactQueryValues(url, ['code', 'state'])).toBe(
      `/login/google?code=${REDACTED_VALUE}&state=${REDACTED_VALUE}`,
    );
  });
});

// Workshop #7, ревью 2026-10-11: обработчик раскодирует имя параметра, и
// `%73tate=` для него тот же `state` — значение оставалось в req.url.
describe('redactQueryValues — закодированное имя параметра', () => {
  const secret = 'e'.repeat(43);

  it.each([
    ['%73tate', 'state'],
    ['%63ode_challenge', 'code_challenge'],
    ['code%5Fchallenge', 'code_challenge'],
    ['%6a%6f%69%6e', 'join'],
    ['%63ode', 'code'],
  ])('%s редактируется как %s, имя в строке остаётся как пришло', (encoded, name) => {
    const url = `/x?${encoded}=${secret}&y=1`;
    expect(redactQueryValues(url, [name])).toBe(`/x?${encoded}=${REDACTED_VALUE}&y=1`);
  });

  it('имя, которое раскодируется в другое, не редактируется', () => {
    const url = `/x?%73tates=${secret}&st%61te_=${secret}`;
    expect(redactQueryValues(url, ['state'])).toBe(url);
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

  it('вход Daychi: state, code_challenge и номер попытки в url не остаются (ADR-0181)', () => {
    const secret = 's'.repeat(43);
    const authorize = `/auth/native/authorize?client_id=daychi-native&state=${secret}&code_challenge=${secret}`;
    const resume = `/api/auth/native/continue?attempt=${'a'.repeat(24)}`;

    const authorizeUrl = redactRequestSerializer(buildIncomingMessage(authorize)).url;
    const resumeUrl = redactRequestSerializer(buildIncomingMessage(resume)).url;

    expect(authorizeUrl).not.toContain(secret);
    expect(authorizeUrl).toContain('client_id=daychi-native');
    expect(resumeUrl).toBe(`/api/auth/native/continue?attempt=${REDACTED_VALUE}`);
  });

  // Вход через Telegram по OIDC (ADR-0187): Telegram возвращает вкладку на
  // /login/telegram?code=…&state=…, и это обычный GET, который логируется.
  // Проверка идёт через настоящий сериализатор, а не через явный список
  // параметров: редакция по имени `code`/`state` общая с Google, и тест
  // ловит случай, когда кто-то уберёт её для обоих входов.
  it('вход Telegram: code и state из /login/telegram в url не остаются (ADR-0187)', () => {
    const code = 't'.repeat(32);
    const state = 'u'.repeat(43);
    const url = `/login/telegram?code=${code}&state=${state}&x=1`;

    const serialized = redactRequestSerializer(buildIncomingMessage(url));

    expect(serialized.url).toBe(
      `/login/telegram?code=${REDACTED_VALUE}&state=${REDACTED_VALUE}&x=1`,
    );
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

  // Вход через Telegram по OIDC (ADR-0187): в строку лога запроса не попадает ни
  // одно значение потока — адрес возврата, тело POST, cookie заявки, Location
  // старта (там state и code_challenge) и Set-Cookie ответа.
  it('в реальном логе pino ничего из потока входа через Telegram не остаётся', () => {
    const secrets = {
      code: 't'.repeat(32),
      state: 'u'.repeat(43),
      challenge: 'v'.repeat(43),
      cookie: 'w'.repeat(40),
    };
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
          url: `/login/telegram?code=${secrets.code}&state=${secrets.state}`,
          headers: { cookie: `telegram_oauth=${secrets.cookie}` },
          query: { code: secrets.code, state: secrets.state },
          body: { code: secrets.code, state: secrets.state },
        },
        res: {
          headers: {
            location: `https://oauth.telegram.org/auth?state=${secrets.state}&code_challenge=${secrets.challenge}`,
            'set-cookie': `telegram_oauth=${secrets.cookie}; HttpOnly`,
          },
        },
      },
      'проверка редакции входа Telegram',
    );

    const line = stream.chunks.join('');
    for (const secret of Object.values(secrets)) expect(line).not.toContain(secret);
  });
});
