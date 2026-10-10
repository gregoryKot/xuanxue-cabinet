// Контроллеры браузерного входа ничего не решают сами: ответ потока уходит как
// есть, `token` пропускает к обмену только форму. HTTP целиком —
// native-authorize/continue/token.e2e-spec.ts.
import { DateTime } from 'luxon';
import { NATIVE_CLIENT_ID, NATIVE_REDIRECT_URI } from '@xuanxue/shared';
import { NativeAuthorizationController } from './native-authorization.controller';
import type { NativeAuthorizationsService } from './native-authorizations.service';
import { NativeAuthorizeController } from './native-authorize.controller';
import type {
  NativeBrowserFlowService,
  NativeBrowserRequest,
} from './native-browser-flow.service';
import type {
  NativeBrowserOutcome,
  NativeBrowserResponseLike,
} from './native-browser-response';
import type { NativeRequestLike } from './native-http';
import { NativeTokenDto } from './native-token.dto';

const CALLBACK = `${NATIVE_REDIRECT_URI}?code=${'k'.repeat(43)}`;
const REDIRECT: NativeBrowserOutcome = {
  kind: 'redirect',
  location: CALLBACK,
  cookie: 'native_authz=v',
};
const TOKENS = { access_token: 'B'.repeat(43) };
const BROWSER_REQUEST: NativeBrowserRequest = { url: '/x', headers: {} };

interface FakeResponse extends NativeBrowserResponseLike {
  statusCode?: number;
  headers: Record<string, string | number>;
}

function fakeResponse(): FakeResponse {
  const res: FakeResponse = {
    headers: {},
    status(code) {
      res.statusCode = code;
      return res;
    },
    setHeader(name, value) {
      res.headers[name] = value;
    },
    getHeader(name) {
      return res.headers[name];
    },
    end() {
      return undefined;
    },
  };
  return res;
}

function build() {
  const flow = {
    authorize: jest.fn().mockResolvedValue(REDIRECT),
    resume: jest.fn().mockResolvedValue({ kind: 'page', status: 400 }),
  };
  const authorizations = { exchange: jest.fn().mockResolvedValue(TOKENS) };
  return {
    flow,
    authorizations,
    authorize: new NativeAuthorizeController(flow as unknown as NativeBrowserFlowService),
    authorization: new NativeAuthorizationController(
      flow as unknown as NativeBrowserFlowService,
      authorizations as unknown as NativeAuthorizationsService,
    ),
  };
}

function tokenBody(): NativeTokenDto {
  return Object.assign(new NativeTokenDto(), {
    grant_type: 'authorization_code',
    client_id: NATIVE_CLIENT_ID,
    redirect_uri: NATIVE_REDIRECT_URI,
    code: 'k'.repeat(43),
    code_verifier: 'v'.repeat(43),
  });
}

function requestOf(contentType: string): NativeRequestLike {
  return { headers: { 'content-type': contentType }, rawHeaders: [] };
}

describe('NativeAuthorizeController', () => {
  it('ответ потока — 302 с Location, cookie привязки и no-store', async () => {
    const { authorize, flow } = build();
    const res = fakeResponse();

    await authorize.authorize(BROWSER_REQUEST, res);

    expect(flow.authorize).toHaveBeenCalledWith(BROWSER_REQUEST, expect.any(DateTime));
    expect(res.statusCode).toBe(302);
    expect(res.headers).toMatchObject({
      Location: CALLBACK,
      'Set-Cookie': 'native_authz=v',
      'Cache-Control': 'no-store',
    });
  });
});

describe('NativeAuthorizationController', () => {
  it('continue: страница потока — со своим статусом и no-store', async () => {
    const { authorization, flow } = build();
    const res = fakeResponse();

    await authorization.resume(BROWSER_REQUEST, res);

    expect(flow.resume).toHaveBeenCalledWith(BROWSER_REQUEST, expect.any(DateTime));
    expect(res.statusCode).toBe(400);
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(res.headers.Location).toBeUndefined();
  });

  it('token: JSON вместо формы — invalid_request, обмена нет', () => {
    const { authorization, authorizations } = build();

    expect(() => authorization.token(requestOf('application/json'), tokenBody())).toThrow(
      'invalid_request',
    );
    expect(authorizations.exchange).not.toHaveBeenCalled();
  });

  it('token: форма — поля уходят в обмен как есть, ответ сервиса тоже', async () => {
    const { authorization, authorizations } = build();
    const body = tokenBody();

    await expect(
      authorization.token(requestOf('application/x-www-form-urlencoded'), body),
    ).resolves.toEqual(TOKENS);
    expect(authorizations.exchange).toHaveBeenCalledWith(body, expect.any(DateTime));
  });
});
