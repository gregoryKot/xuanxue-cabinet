// Найти-или-завести человека при входе через Google (ADR-0145) — правила
// связки по email описаны там же, здесь только код. Порядок проверок:
//   1. googleId === sub уже есть → это тот же человек, email из Google
//      заново не читаем и не сверяем — sub единственный стабильный ключ,
//      адрес Google однажды мог перевыпустить на другой ящик.
//   2. иначе, если Google ручается за email (emailVerified) — ищем по
//      ПОДТВЕРЖДЁННОМУ `email` (EmailLoginUserService.findByEmail, никогда
//      pendingEmail — ADR-0059): найден → либо привязываем googleId (только
//      если Google ещё и authoritative за домен, иначе адрес когда-то
//      подтверждён в Google, но не факт, что владелец тот же — email-вход
//      остаётся способом попасть внутрь), либо отказ (заблокирован/занят
//      другим Google).
//   3. иначе — новый человек, требует валидную ссылку-приглашение
//      (require-valid-invite.ts), invite игнорируется для веток 1 и 2.
// Telegram-only человек (email нет вовсе) сюда не попадает веткой 2 и уйдёт
// в ветку 3 — заведётся вторым аккаунтом. Явная привязка Google из профиля
// уже вошедшего — отдельная фича, следующий PR (не в этом контракте).
import { Injectable } from '@nestjs/common';
import type { DateTime } from 'luxon';
import {
  ACCESS_MESSAGE,
  GOOGLE_EMAIL_NEEDS_EMAIL_LOGIN_MESSAGE,
  GOOGLE_NOT_LINKED_MESSAGE,
  GOOGLE_OTHER_ACCOUNT_MESSAGE,
  joinPersonName,
  NEW_PERSON_NAME,
} from '@xuanxue/shared';
import { ConflictError, ForbiddenError } from '../common/errors';
import { EmailLoginUserService } from './email-login-user.service';
import { GoogleLoginUserService } from './google-login-user.service';
import { InviteLinkService } from './invite-link.service';
import { markUserJoined } from './mark-user-joined';
import { requireValidInvite } from './require-valid-invite';
import { UsersService, type UserLean } from './users.service';

/** Итог проверки id_token (google-id-token.ts, auth/) — тип объявлен здесь,
 * не в auth/: auth/ уже зависит от users/ (AuthModule импортирует
 * UsersModule), обратный импорт замкнул бы цикл (eslint import-x/no-cycle). */
export interface GoogleIdentity {
  sub: string;
  email?: string;
  emailVerified: boolean;
  /** Google ручается за владельца адреса (Gmail/Workspace, ADR-0145) — не
   * просто «подтверждён когда-то», а «этот домен подтверждает Google». */
  emailAuthoritative: boolean;
  givenName?: string;
  familyName?: string;
  name?: string;
}

@Injectable()
export class GoogleLoginIdentityService {
  constructor(
    private readonly googleLoginUserService: GoogleLoginUserService,
    private readonly emailLoginUserService: EmailLoginUserService,
    private readonly inviteLinkService: InviteLinkService,
    private readonly usersService: UsersService,
  ) {}

  async resolveGoogleUser(
    identity: GoogleIdentity,
    inviteCode: string | undefined,
    now: DateTime,
  ): Promise<UserLean> {
    const bySub = await this.googleLoginUserService.findByGoogleId(identity.sub);
    if (bySub) return bySub;

    if (identity.email && identity.emailVerified) {
      const byEmail = await this.emailLoginUserService.findByEmail(identity.email);
      if (byEmail) return this.linkExisting(byEmail, identity);
    }

    await requireValidInvite(
      this.inviteLinkService,
      inviteCode,
      GOOGLE_NOT_LINKED_MESSAGE,
    );
    const created = await this.googleLoginUserService.createFromGoogle({
      sub: identity.sub,
      name: displayName(identity),
      email: identity.emailAuthoritative ? identity.email : undefined,
    });
    return markUserJoined(this.usersService, created, now);
  }

  /** Ветка 2 выше — человек с этим email уже есть. Invite игнорируется:
   * существующий вход не спрашивает ссылку (тот же принцип, что у
   * Telegram/email-входа, ADR-0036). */
  private async linkExisting(
    existing: UserLean,
    identity: GoogleIdentity,
  ): Promise<UserLean> {
    if (!identity.emailAuthoritative) {
      throw new ConflictError(GOOGLE_EMAIL_NEEDS_EMAIL_LOGIN_MESSAGE);
    }
    if (existing.status === 'blocked') throw new ForbiddenError(ACCESS_MESSAGE);
    if (existing.googleId && existing.googleId !== identity.sub) {
      throw new ConflictError(GOOGLE_OTHER_ACCOUNT_MESSAGE);
    }

    const attached = await this.googleLoginUserService.attachGoogleId(
      existing.id,
      identity.sub,
    );
    if (attached) return attached;

    // Гонка: кто-то другой привязал этот же googleId первым между чтением
    // выше и записью. Перечитываем по sub — свой же аккаунт значит просто
    // «мы сами и выиграли гонку в параллельном запросе», чужой — конфликт.
    const bySubAfterRace = await this.googleLoginUserService.findByGoogleId(identity.sub);
    if (bySubAfterRace && bySubAfterRace.id === existing.id) return bySubAfterRace;
    throw new ConflictError(GOOGLE_OTHER_ACCOUNT_MESSAGE);
  }
}

function displayName(identity: GoogleIdentity): string {
  const joined = joinPersonName(identity.givenName ?? '', identity.familyName);
  return joined || identity.name || NEW_PERSON_NAME;
}
