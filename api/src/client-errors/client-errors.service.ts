// Приём отчёта браузера о сбое (ADR-0071, вторая половина ADR-0053): пишет
// в лог всегда, будит админа в Telegram через тот же порт AppErrorAlerts,
// что и DomainExceptionFilter (общий дедуп и общий часовой потолок на один
// телефон — незачем удваивать будильник, если сервер и браузер посыпались
// одновременно), и пишет в журнал сбоев (AppErrorJournal, ADR-0132) — все
// виды, включая `chunk`: журнал не будильник, а история для разбора, а
// молчаливую дыру в видах экран «Сбои» показал бы как «сбоев не было».
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { DateTime } from 'luxon';
import {
  CLIENT_ERROR_LIMITS,
  clampClientErrorText,
  type ClientErrorKind,
  type ReportClientErrorInput,
} from '@xuanxue/shared';
import { APP_ERROR_ALERTS, type AppErrorAlerts } from '../common/app-error-alerts';
import { APP_ERROR_JOURNAL, type AppErrorJournal } from '../common/app-error-journal';
import { errorMessage } from '../common/error-info';
import { pathWithoutQuery } from '../common/request-info';

// 'chunk' — код экрана не догрузился: после деплоя старых хешированных
// чанков на сервере уже нет, открытая вкладка чинится одной перезагрузкой
// сама. Будить админа в Telegram на каждый мерж, который меняет хеши
// чанков, незачем — строки в логе достаточно (shared/src/client-errors.ts).
const SILENT_KINDS: readonly ClientErrorKind[] = ['chunk'];

@Injectable()
export class ClientErrorsService {
  private readonly logger = new Logger(ClientErrorsService.name);

  constructor(
    // @Optional(): без TelegramModule (юнит-тесты, сборка без бота) сервис
    // обязан работать как раньше — лог остаётся, алёрт в Telegram нет
    // (тот же приём, что у DomainExceptionFilter.appErrorAlerts).
    @Optional()
    @Inject(APP_ERROR_ALERTS)
    private readonly alerts?: AppErrorAlerts,
    // @Optional(): та же причина, что у alerts выше.
    @Optional()
    @Inject(APP_ERROR_JOURNAL)
    private readonly journal?: AppErrorJournal,
  ) {}

  /** Не должен ни задерживать ответ контроллеру, ни падать из-за
   * недоступного Telegram (CLAUDE.md «Ошибки») — один в один приём
   * notifyAppError в DomainExceptionFilter. */
  report(
    input: ReportClientErrorInput,
    requestId: string | undefined,
    userAgent?: string,
  ): void {
    const kind = input.kind;
    // Клиенту не верим: query режется на сервере, даже если DTO уже
    // проверил форму пути (SECURITY §6 — в query бывают токены входа).
    const path = clampClientErrorText(
      pathWithoutQuery(input.path),
      CLIENT_ERROR_LIMITS.path,
    );
    const message = clampClientErrorText(input.message, CLIENT_ERROR_LIMITS.message);

    // errorText, а не message: `message` в строке лога Railway занимает сам
    // и наше поле затирает (logging.module.ts, RESERVED_LOG_KEY).
    this.logger.error({ requestId, kind, path, errorText: message }, 'Сбой в браузере');

    this.journal
      ?.record(
        { requestId, source: 'browser', kind, path, text: message, userAgent },
        DateTime.utc(),
      )
      .catch((err: unknown) => {
        this.logger.error(
          `app_error journal: не удалось записать сбой (requestId=${requestId ?? '-'}): ${errorMessage(err)}`,
        );
      });

    if (SILENT_KINDS.includes(kind)) return;

    this.alerts
      ?.notifyClientError({ requestId, kind, path }, DateTime.utc())
      .catch((err: unknown) => {
        this.logger.error(
          `client_error alert: не удалось уведомить админа (requestId=${requestId ?? '-'}): ${errorMessage(err)}`,
        );
      });
  }
}
