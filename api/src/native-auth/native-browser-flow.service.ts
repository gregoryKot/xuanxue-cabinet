// Браузерная часть входа Daychi (ADR-0181, профиль Workshop 3c98d4a): что
// ответить на `authorize` и `continue`. Оба пути сходятся в одном шаге — есть
// ли в браузере сессия активного человека: есть — код и callback, заблокирован —
// `access_denied`, нет — экран входа `/login/native` с номером попытки.
//
// Ошибка после проверки клиента, redirect URI и state уходит в callback
// (`temporarily_unavailable`, если нет базы, иначе `server_error`): Daychi
// узнаёт о сбое, а не ждёт до своего срока. Раньше этой проверки — только
// локальная страница, адреса для callback ещё нет.
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DateTime } from 'luxon';
import { NATIVE_REDIRECT_URI } from '@xuanxue/shared';
import { AuthService } from '../auth/auth.service';
import { findSessionUser } from '../auth/session-user';
import { asSingleHeader } from '../common/http-headers';
import { UsersService } from '../users/users.service';
import {
  NativeAuthorizationsService,
  type NativeCallbackTarget,
  type NativeCompletion,
} from './native-authorizations.service';
import { nativeAuthzBinding, readNativeAuthzCookie } from './native-authz-cookie';
import {
  nativeCallbackUrl,
  nativeContinuationPath,
  parseAuthorizeQuery,
  parseContinueQuery,
} from './native-browser-query';
import {
  NATIVE_BAD_REQUEST_PAGE,
  redirectTo,
  type NativeBrowserOutcome,
} from './native-browser-response';
import { isMongoUnavailableError, logNativeFailure } from './native-error.filter';
import { sha256Hex } from './native-secrets';

/** Запрос в том виде, в каком его читает поток (Express 5). */
export interface NativeBrowserRequest {
  id?: unknown;
  url?: string;
  originalUrl?: string;
  headers: Record<string, string | string[] | undefined>;
}

function rawUrlOf(req: NativeBrowserRequest): string | undefined {
  return req.originalUrl ?? req.url;
}

function cookieHeaderOf(req: NativeBrowserRequest): string | undefined {
  return asSingleHeader(req.headers.cookie);
}

@Injectable()
export class NativeBrowserFlowService {
  private readonly logger = new Logger(NativeBrowserFlowService.name);

  constructor(
    private readonly authorizations: NativeAuthorizationsService,
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly config: ConfigService,
  ) {}

  async authorize(
    req: NativeBrowserRequest,
    now: DateTime,
  ): Promise<NativeBrowserOutcome> {
    const query = parseAuthorizeQuery(rawUrlOf(req));
    if (query.kind === 'rejected') return NATIVE_BAD_REQUEST_PAGE;
    const issuer = this.config.get<string>('PUBLIC_URL');
    if (!issuer) return this.failurePage(new Error('PUBLIC_URL не задан'), req);
    if (query.kind === 'error') {
      const target = { issuer, redirectUri: NATIVE_REDIRECT_URI, state: query.state };
      return redirectTo(nativeCallbackUrl(target, { error: query.error }));
    }

    const binding = nativeAuthzBinding(cookieHeaderOf(req));
    const bindingHash = sha256Hex(binding.value);
    const target = {
      issuer,
      redirectUri: NATIVE_REDIRECT_URI,
      state: query.request.state,
    };
    const outcome = await this.guarded(target, req, async () => {
      const attemptId = await this.authorizations.create(
        { ...query.request, issuer },
        bindingHash,
        now,
      );
      return this.finish(attemptId, bindingHash, req, now);
    });
    return outcome.kind === 'redirect' ? { ...outcome, cookie: binding.cookie } : outcome;
  }

  /** Попытку выбирает номер из адреса, но годится только своя: та же привязка
   * браузера, не истёкшая, не завершённая. Параметры callback — из записи. */
  async resume(req: NativeBrowserRequest, now: DateTime): Promise<NativeBrowserOutcome> {
    const query = parseContinueQuery(rawUrlOf(req));
    const binding = readNativeAuthzCookie(cookieHeaderOf(req));
    if (!query || !binding) return NATIVE_BAD_REQUEST_PAGE;
    const bindingHash = sha256Hex(binding);

    let target: NativeCallbackTarget | null;
    try {
      target = await this.authorizations.findPending(query.attemptId, bindingHash, now);
    } catch (error) {
      return this.failurePage(error, req);
    }
    if (!target) return NATIVE_BAD_REQUEST_PAGE;
    return this.guarded(target, req, () =>
      query.cancel
        ? this.settle(query.attemptId, bindingHash, { denied: true }, now)
        : this.finish(query.attemptId, bindingHash, req, now),
    );
  }

  private async finish(
    attemptId: string,
    bindingHash: string,
    req: NativeBrowserRequest,
    now: DateTime,
  ): Promise<NativeBrowserOutcome> {
    const user = await findSessionUser(
      cookieHeaderOf(req),
      this.authService,
      this.usersService,
      now,
    );
    if (!user) return redirectTo(nativeContinuationPath(attemptId));
    const completion: NativeCompletion =
      user.status === 'active' ? { userId: user.id } : { denied: true };
    return this.settle(attemptId, bindingHash, completion, now);
  }

  private async settle(
    attemptId: string,
    bindingHash: string,
    completion: NativeCompletion,
    now: DateTime,
  ): Promise<NativeBrowserOutcome> {
    const done = await this.authorizations.complete(
      attemptId,
      bindingHash,
      completion,
      now,
    );
    if (!done) return NATIVE_BAD_REQUEST_PAGE;
    return redirectTo(
      nativeCallbackUrl(
        done,
        done.code ? { code: done.code } : { error: 'access_denied' },
      ),
    );
  }

  private async guarded(
    target: NativeCallbackTarget,
    req: NativeBrowserRequest,
    run: () => Promise<NativeBrowserOutcome>,
  ): Promise<NativeBrowserOutcome> {
    try {
      return await run();
    } catch (error) {
      const unavailable = isMongoUnavailableError(error);
      if (!unavailable) logNativeFailure(this.logger, req, error);
      return redirectTo(
        nativeCallbackUrl(target, {
          error: unavailable ? 'temporarily_unavailable' : 'server_error',
        }),
      );
    }
  }

  private failurePage(error: unknown, req: NativeBrowserRequest): NativeBrowserOutcome {
    const unavailable = isMongoUnavailableError(error);
    if (!unavailable) logNativeFailure(this.logger, req, error);
    const status = unavailable
      ? HttpStatus.SERVICE_UNAVAILABLE
      : HttpStatus.INTERNAL_SERVER_ERROR;
    return { kind: 'page', status };
  }
}
