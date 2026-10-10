// Контроллер ничего не решает сам: до сервиса доходит ровно присланный bearer
// или токен формы, чужой client_id отказывает раньше сервиса. HTTP целиком —
// native-*.e2e-spec.ts.
import {
  NATIVE_CLIENT_ID,
  NATIVE_SCOPE,
  NATIVE_TOKEN_TYPE,
  type NativeTokenResponse,
} from '@xuanxue/shared';
import { toMeDto } from '../auth/user.mapper';
import type { PersonalChats } from '../telegram/personal-chats';
import type { UserLean } from '../users/users.service';
import { NativeAccountController } from './native-account.controller';
import type { NativeGrantsService } from './native-grants.service';
import type { NativeRequestLike } from './native-http';
import { NativeRevokeDto } from './native-revoke.dto';

const TOKEN = 'A'.repeat(43);
const FORM_TYPE = 'application/x-www-form-urlencoded';

const USER: UserLean = {
  id: 'u1',
  name: 'Мария',
  roles: [],
  status: 'active',
  studentMode: false,
};

const SESSION = { id: 'g1', expires_in: 100, renew_after: 50 };

const RENEWED: NativeTokenResponse = {
  access_token: 'B'.repeat(43),
  token_type: NATIVE_TOKEN_TYPE,
  expires_in: 100,
  scope: NATIVE_SCOPE,
  session_id: 'g1',
  renew_after: 50,
};

function build(): {
  controller: NativeAccountController;
  grants: Record<'authenticate' | 'sessionView' | 'renew' | 'revoke', jest.Mock>;
} {
  const grants = {
    authenticate: jest.fn().mockResolvedValue({ user: USER, credential: {}, grant: {} }),
    sessionView: jest.fn().mockReturnValue(SESSION),
    renew: jest.fn().mockResolvedValue(RENEWED),
    revoke: jest.fn().mockResolvedValue(undefined),
  };
  const personalChats = { hasActiveChatFor: jest.fn().mockResolvedValue(true) };
  const controller = new NativeAccountController(
    grants as unknown as NativeGrantsService,
    personalChats as unknown as PersonalChats,
  );
  return { controller, grants };
}

function bearerRequest(rest: Partial<NativeRequestLike> = {}): NativeRequestLike {
  return {
    headers: { authorization: `Bearer ${TOKEN}` },
    rawHeaders: ['Authorization', `Bearer ${TOKEN}`],
    ...rest,
  };
}

function revokeBody(clientId: string): NativeRevokeDto {
  return Object.assign(new NativeRevokeDto(), { client_id: clientId, token: TOKEN });
}

const formRequest: NativeRequestLike = {
  headers: { 'content-type': FORM_TYPE },
  rawHeaders: ['Content-Type', FORM_TYPE],
};

describe('NativeAccountController', () => {
  it('me: аккаунт — тем же маппером, что веб, сроки — по присланному bearer', async () => {
    const { controller, grants } = build();

    const res = await controller.me(bearerRequest({ query: {} }));

    expect(res).toEqual({ account: toMeDto(USER, true), session: SESSION });
    expect(grants.authenticate).toHaveBeenCalledWith(TOKEN, expect.anything());
  });

  it('me с параметром в адресе — invalid_request, до сервиса не доходит', async () => {
    const { controller, grants } = build();

    await expect(controller.me(bearerRequest({ query: { a: '1' } }))).rejects.toThrow(
      'invalid_request',
    );
    expect(grants.authenticate).not.toHaveBeenCalled();
  });

  it('renew: пустой JSON — ответ сервиса как есть', async () => {
    const { controller, grants } = build();
    const req = bearerRequest({ body: {} });
    req.headers['content-type'] = 'application/json';
    req.headers['content-length'] = '2';

    await expect(controller.renew(req)).resolves.toEqual(RENEWED);
    expect(grants.renew).toHaveBeenCalledWith(TOKEN, expect.anything());
  });

  it('revoke чужим client_id — invalid_client, токен не трогается', async () => {
    const { controller, grants } = build();

    await expect(controller.revoke(formRequest, revokeBody('other-app'))).rejects.toThrow(
      'invalid_client',
    );
    expect(grants.revoke).not.toHaveBeenCalled();
  });

  it('revoke своим client_id — токен формы уходит в сервис, тело пустое', async () => {
    const { controller, grants } = build();

    await expect(
      controller.revoke(formRequest, revokeBody(NATIVE_CLIENT_ID)),
    ).resolves.toBeUndefined();
    expect(grants.revoke).toHaveBeenCalledWith(TOKEN, expect.anything());
  });
});
