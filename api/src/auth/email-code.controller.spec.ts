// Test.createTestingModule с фейком сервиса — образец
// email-link.controller.spec.ts (тот же приём у join.controller.spec.ts).
// Главное, что проверяем: адрес и код едут в EmailAuthService.verifyCode()
// как есть, cookie сессии уходит заголовком Set-Cookie (ADR-0012), а ответ
// — MeDto, собранный тем же toMeDto(), что GET /auth/me: экран входа по
// коду кладёт профиль прямо из ответа записи, без второго запроса
// (ADR-0087, web/src/auth/useEmailCodeLogin.ts). Импорт контроллера тянет
// за собой VerifyEmailCodeDto, поэтому его декораторы тоже выполняются.
import { Test } from '@nestjs/testing';
import type { MeDto } from '@xuanxue/shared';
import { PersonalChats } from '../telegram/personal-chats';
import type { ResponseLike } from '../common/http-headers';
import type { UserLean } from '../users/users.service';
import { EmailAuthService } from './email-auth.service';
import { EmailCodeController } from './email-code.controller';

const USER: UserLean = {
  id: 'u1',
  name: 'Мария',
  roles: [],
  status: 'active',
  email: 'maria@example.com',
};

const COOKIE = 'session=token; HttpOnly; Path=/';

interface VerifyCall {
  email: string;
  code: string;
  inviteCode?: string;
}

/** Заголовки, которые контроллер поставил ответу, — чтобы проверить сам
 * Set-Cookie, а не только тело (фейк `ResponseLike`, тот же приём, что в
 * auth.controller.spec.ts). */
function fakeResponse(): { res: ResponseLike; headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  const res: ResponseLike = {
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
  };
  return { res, headers };
}

async function buildController(): Promise<{
  controller: EmailCodeController;
  verifyCalls: VerifyCall[];
}> {
  const verifyCalls: VerifyCall[] = [];
  const module = await Test.createTestingModule({
    controllers: [EmailCodeController],
    providers: [
      {
        provide: EmailAuthService,
        useValue: {
          verifyCode: (
            email: string,
            code: string,
            _now: unknown,
            inviteCode?: string,
          ) => {
            verifyCalls.push({ email, code, inviteCode });
            return Promise.resolve({ user: USER, cookie: COOKIE });
          },
        },
      },
      {
        provide: PersonalChats,
        useValue: { hasActiveChatFor: () => Promise.resolve(false) },
      },
    ],
  }).compile();
  return { controller: module.get(EmailCodeController), verifyCalls };
}

describe('EmailCodeController.verifyEmailCode', () => {
  it('адрес, код и inviteCode едут в EmailAuthService.verifyCode()', async () => {
    const { controller, verifyCalls } = await buildController();
    const { res } = fakeResponse();
    const inviteCode = 'a'.repeat(32);

    await controller.verifyEmailCode(
      { email: 'maria@example.com', code: '123456', inviteCode },
      res,
    );

    expect(verifyCalls).toEqual([
      { email: 'maria@example.com', code: '123456', inviteCode },
    ]);
  });

  it('без inviteCode — тот же вызов, поле undefined (вход существующего человека)', async () => {
    const { controller, verifyCalls } = await buildController();
    const { res } = fakeResponse();

    await controller.verifyEmailCode({ email: 'maria@example.com', code: '123456' }, res);

    expect(verifyCalls).toEqual([
      { email: 'maria@example.com', code: '123456', inviteCode: undefined },
    ]);
  });

  it('cookie сессии уходит заголовком, ответ — MeDto без самого адреса', async () => {
    const { controller } = await buildController();
    const { res, headers } = fakeResponse();

    const result = await controller.verifyEmailCode(
      { email: 'maria@example.com', code: '123456' },
      res,
    );

    expect(headers['Set-Cookie']).toBe(COOKIE);
    expect(result).toEqual<MeDto>({
      id: USER.id,
      name: USER.name,
      roles: USER.roles,
      status: USER.status,
      telegramLinked: false,
      botChatActive: false,
      // Признак «ключ есть», а не сам адрес: чужие адреса наружу не ходят,
      // свой человеку и так известен (SECURITY §2, ADR-0059).
      hasEmail: true,
      noTelegram: false,
      needsProfile: true,
    });
    expect(result).not.toHaveProperty('email');
  });
});
