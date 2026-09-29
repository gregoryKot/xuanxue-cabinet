// Общая проверка «код ссылки-приглашения валиден» (ADR-0030/0036) — раньше
// была приватным методом LoginIdentityService, вынесена отдельно: тот же
// код нужен и GoogleLoginIdentityService (правило CLAUDE.md «Дубли», иначе
// jscpd поймал бы вторую копию). Код нужен только для НОВОГО человека —
// существующий вход его игнорирует, вызывающий код зовёт эту функцию только
// на этой ветке.
import { NO_INVITE_LINK_MESSAGE } from '@xuanxue/shared';
import { ForbiddenError } from '../common/errors';
import type { InviteLinkService } from './invite-link.service';

export async function requireValidInvite(
  inviteLinkService: InviteLinkService,
  inviteCode: string | undefined,
): Promise<void> {
  const isValid = inviteCode ? await inviteLinkService.isValid(inviteCode) : false;
  if (!isValid) throw new ForbiddenError(NO_INVITE_LINK_MESSAGE);
}
