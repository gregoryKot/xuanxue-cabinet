// Юнит-тест requireValidInvite (require-valid-invite.ts) — фейковый
// InviteLinkService, без Mongo.
import { NO_INVITE_LINK_MESSAGE } from '@xuanxue/shared';
import { ForbiddenError } from '../common/errors';
import type { InviteLinkService } from './invite-link.service';
import { requireValidInvite } from './require-valid-invite';

function fakeInvites(isValid: (code: string) => boolean): InviteLinkService {
  return {
    isValid: (code: string) => Promise.resolve(isValid(code)),
  } as InviteLinkService;
}

describe('requireValidInvite', () => {
  it('код не передан — ForbiddenError, InviteLinkService не зовётся', async () => {
    const invites = fakeInvites(() => {
      throw new Error('не должен был вызваться');
    });

    await expect(requireValidInvite(invites, undefined)).rejects.toThrow(
      NO_INVITE_LINK_MESSAGE,
    );
  });

  it('код невалиден — ForbiddenError', async () => {
    const invites = fakeInvites(() => false);

    await expect(requireValidInvite(invites, 'a'.repeat(32))).rejects.toThrow(
      ForbiddenError,
    );
  });

  it('код валиден — не бросает', async () => {
    const invites = fakeInvites(() => true);

    await expect(requireValidInvite(invites, 'a'.repeat(32))).resolves.toBeUndefined();
  });
});
