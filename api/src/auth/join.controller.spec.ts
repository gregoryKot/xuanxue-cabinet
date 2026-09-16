// Тонкий контроллер — прокидывает код в InviteLinkService.isValid() (CLAUDE.md
// «Логика вне контроллеров»). Throttle/CSRF/сам вход — auth-join.e2e-spec.ts,
// auth-telegram-invite.e2e-spec.ts.
import type { InviteLinkService } from '../users/invite-link.service';
import { JoinController } from './join.controller';

describe('JoinController', () => {
  it('checkInvite() возвращает { valid: true } для валидного кода', async () => {
    const isValid = jest.fn().mockResolvedValue(true);
    const controller = new JoinController({
      isValid,
    } as unknown as InviteLinkService);

    const result = await controller.checkInvite({ code: 'a'.repeat(32) });

    expect(isValid).toHaveBeenCalledWith('a'.repeat(32));
    expect(result).toEqual({ valid: true });
  });

  it('checkInvite() возвращает { valid: false } для неверного кода', async () => {
    const isValid = jest.fn().mockResolvedValue(false);
    const controller = new JoinController({
      isValid,
    } as unknown as InviteLinkService);

    const result = await controller.checkInvite({ code: '0'.repeat(32) });

    expect(result).toEqual({ valid: false });
  });
});
