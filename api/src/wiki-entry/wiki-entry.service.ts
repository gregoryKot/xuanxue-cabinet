// Вход из wiki (ADR-0183): браузер пришёл с wiki на `/wiki?returnTo=…`, а кабинет
// решает, куда его вернуть. Сессия есть и аккаунт не заблокирован — на wiki с
// общей cookie; сессии нет — на вход кабинета, который вернёт сюда же;
// заблокирован — страница отказа, без перехода: wiki не должна принимать того,
// кому кабинет закрыт. Правило доступа то же, что у AuthGuard: отказывает
// только `blocked`, прочих статусов у человека нет.
import { Injectable, Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import { AuthService } from '../auth/auth.service';
import { asSingleHeader } from '../common/http-headers';
import { NotFoundError } from '../common/errors';
import { errorMessage, errorStack } from '../common/error-info';
import { requestIdOf } from '../common/request-info';
import { UsersService } from '../users/users.service';
import {
  parseWikiReturnTo,
  wikiLoginPath,
  type WikiEntryOutcome,
  type WikiReturnTo,
} from './wiki-entry';
import {
  WIKI_ENTRY_BLOCKED,
  WIKI_ENTRY_INVALID,
  WIKI_ENTRY_UNAVAILABLE,
} from './wiki-entry-response';

/** Запрос в том виде, в каком его читает вход из wiki (Express 5). */
export interface WikiEntryRequest {
  id?: unknown;
  url?: string;
  originalUrl?: string;
  headers: Record<string, string | string[] | undefined>;
}

const LOCAL_PROFILE_MESSAGE = 'Wiki у этого окружения нет.';

/** Часть адреса после первого `?`, как пришла: разбирает её parseWikiReturnTo. */
function rawQueryOf(req: WikiEntryRequest): string | undefined {
  const url = req.originalUrl ?? req.url ?? '';
  const mark = url.indexOf('?');
  return mark === -1 ? undefined : url.slice(mark + 1);
}

function redirect(location: string, cookies?: string[]): WikiEntryOutcome {
  return { kind: 'redirect', location, cookies };
}

@Injectable()
export class WikiEntryService {
  private readonly logger = new Logger(WikiEntryService.name);

  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  async enter(req: WikiEntryRequest, now: DateTime): Promise<WikiEntryOutcome> {
    const wikiOrigin = this.authService.wikiOrigin();
    // Доменная ошибка, а не страница: глобальный фильтр ответит как на любой
    // неизвестный адрес, локальная разработка маршрута «не видит».
    if (!wikiOrigin) throw new NotFoundError(LOCAL_PROFILE_MESSAGE);
    const target = parseWikiReturnTo(rawQueryOf(req), wikiOrigin);
    if (!target.ok) return WIKI_ENTRY_INVALID;
    try {
      return await this.decide(req, target, now);
    } catch (error) {
      // Сбой проверки не равен «сессии нет»: отправить человека на вход при
      // упавшей базе значило бы выкинуть читателя из рабочей сессии.
      this.logger.error(
        `Вход из wiki упал (requestId=${requestIdOf(req) ?? '-'}): ${errorMessage(error)}`,
        errorStack(error),
      );
      return WIKI_ENTRY_UNAVAILABLE;
    }
  }

  private async decide(
    req: WikiEntryRequest,
    target: Extract<WikiReturnTo, { ok: true }>,
    now: DateTime,
  ): Promise<WikiEntryOutcome> {
    const toLogin = redirect(wikiLoginPath(target.destination));
    const session = this.authService.readSession(asSingleHeader(req.headers.cookie), now);
    if (!session) return toLogin;
    const user = await this.usersService.findById(session.payload.sub);
    if (!user) return toLogin;
    if (user.status === 'blocked') return WIKI_ENTRY_BLOCKED;
    return redirect(target.location, this.authService.sharedSessionCookies(session, now));
  }
}
