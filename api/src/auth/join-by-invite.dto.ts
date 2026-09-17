// Тело POST /auth/join/check — код ссылки-приглашения школы (ADR-0030).
// Формат — INVITE_CODE_RE: randomBytes(16).toString('hex').
import { Matches } from 'class-validator';
import { INVITE_CODE_RE, type JoinByInviteInput } from '@xuanxue/shared';

const INVALID_CODE_MESSAGE = 'Ссылка повреждена. Скопируйте её ещё раз.';

export class JoinByInviteDto implements JoinByInviteInput {
  @Matches(INVITE_CODE_RE, { message: INVALID_CODE_MESSAGE })
  code!: string;
}
