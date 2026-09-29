// Привязка Google к уже вошедшему человеку из профиля (ADR-0145) — НЕ
// слияние аккаунтов (тот же довод, что у занятого Telegram, ADR-0034): если
// этот Google уже ключ входа другого аккаунта, привязка отказывает и
// предлагает написать учителю, а не переносит данные молча. Email от Google
// на этом пути не пишется и не сверяется вовсе — только сам ключ входа,
// адрес аккаунта остаётся как есть (тот же принцип, что у EmailLinkService,
// ADR-0059: привязка — действие вошедшего, не повторный вход).
import { Injectable } from '@nestjs/common';
import { GOOGLE_LINK_OTHER_MESSAGE, GOOGLE_LINK_TAKEN_MESSAGE } from '@xuanxue/shared';
import { ConflictError } from '../common/errors';
import type { GoogleIdentity } from './google-login-identity.service';
import { GoogleLoginUserService } from './google-login-user.service';
import type { UserLean } from './users.service';

@Injectable()
export class GoogleLinkService {
  constructor(private readonly googleLoginUserService: GoogleLoginUserService) {}

  /** `user` — владелец сессии, из которой пришёл запрос на привязку
   * (GoogleAuthService сверяет это со `userId` в cookie google_oauth и
   * отсекает blocked раньше, чем позвать этот метод). */
  async link(user: UserLean, identity: GoogleIdentity): Promise<UserLean> {
    if (user.googleId === identity.sub) return user; // повтор — идемпотентно
    if (user.googleId) throw new ConflictError(GOOGLE_LINK_OTHER_MESSAGE);

    const attached = await this.googleLoginUserService.attachGoogleId(
      user.id,
      identity.sub,
    );
    if (attached) return attached;

    // null — либо гонка (кто-то поставил user.googleId между чтением выше и
    // записью), либо identity.sub уже занят другим аккаунтом (уникальный
    // индекс googleId, E11000 — attachGoogleId сам ловит его и отдаёт null).
    // Перечитываем по sub: свой же аккаунт — конкурентная привязка того же
    // Google выиграла гонку раньше нас, это тоже успех; чужой — отказ.
    const bySub = await this.googleLoginUserService.findByGoogleId(identity.sub);
    if (bySub && bySub.id === user.id) return bySub;
    throw new ConflictError(GOOGLE_LINK_TAKEN_MESSAGE);
  }
}
