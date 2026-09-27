// Реализация AppErrorJournal (порт — common/app-error-journal.ts) поверх
// Mongo: журнал сбоев (ADR-0132) для экрана «Сбои» (роль `admin`). Пишут
// DomainExceptionFilter и ClientErrorsService фактически синхронно с
// алёртом в Telegram — здесь дедупа и потолка на частоту нет (это не
// будильник в кармане, а история для разбора), но есть потолок числа записей
// (APP_ERROR_LIMITS.maxRecords): всплеск отчётов браузера после плохого
// деплоя не должен раздувать базу быстрее, чем успевает подмести TTL.
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DateTime } from 'luxon';
import { Model } from 'mongoose';
import {
  APP_ERROR_LIMITS,
  clampClientErrorText,
  type AppErrorListDto,
  type ListAppErrorsQuery,
} from '@xuanxue/shared';
import type { AppErrorJournal, AppErrorJournalEntry } from '../common/app-error-journal';
import { errorMessage } from '../common/error-info';
import { pathWithoutQuery } from '../common/request-info';
import { encryptRecord } from '../utils/encryption';
import { decryptAppError, toAppErrorDto, type RawLeanAppError } from './app-error.mapper';
import { APP_ERROR_ENCRYPT_SCHEMA, AppErrorRecord } from './app-error.schema';

// 'chunk' в last24h не считается — тем же доводом, что SILENT_KINDS в
// ClientErrorsService: код экрана не догрузился чинится перезагрузкой сам,
// раздувать число сбоя раздела на каждый деплой незачем (CLAUDE.md
// «Продуктовая фича = число в своём разделе», честный ноль на пустой базе).
const LAST_24H_EXCLUDED_KIND = 'chunk';

@Injectable()
export class AppErrorsService implements AppErrorJournal {
  private readonly logger = new Logger(AppErrorsService.name);

  constructor(
    @InjectModel(AppErrorRecord.name)
    private readonly model: Model<AppErrorRecord>,
  ) {}

  /** Не должен ронять вызывающий код (CLAUDE.md «Ошибки»): вызывающие сами
   * зовут fire-and-forget с `.catch()`, но и здесь отказ Mongo ловится сам —
   * второй сбой не должен родиться из попытки записать первый. */
  async record(entry: AppErrorJournalEntry, now: DateTime): Promise<void> {
    try {
      await this.insertAndTrim(entry, now);
    } catch (err) {
      this.logger.error(
        `app_error journal: не удалось записать сбой (requestId=${entry.requestId ?? '-'}): ${errorMessage(err)}`,
      );
    }
  }

  async list(query: ListAppErrorsQuery, now: DateTime): Promise<AppErrorListDto> {
    const filter: Record<string, unknown> = {};
    if (query.requestId) filter.requestId = query.requestId;
    if (query.source) filter.source = query.source;
    if (query.kind) filter.kind = query.kind;

    const [docs, last24h] = await Promise.all([
      this.model
        .find(filter)
        .sort({ occurredAt: -1 })
        .limit(query.limit ?? APP_ERROR_LIMITS.defaultLimit)
        .lean<RawLeanAppError[]>(),
      this.countLast24h(now),
    ]);

    return {
      items: docs.map((doc) => toAppErrorDto(decryptAppError(doc))),
      last24h,
    };
  }

  private async countLast24h(now: DateTime): Promise<number> {
    return this.model.countDocuments({
      occurredAt: { $gte: now.minus({ hours: 24 }).toJSDate() },
      kind: { $ne: LAST_24H_EXCLUDED_KIND },
    });
  }

  private async insertAndTrim(entry: AppErrorJournalEntry, now: DateTime): Promise<void> {
    const payload = encryptRecord(
      {
        requestId: entry.requestId
          ? clampClientErrorText(entry.requestId, APP_ERROR_LIMITS.requestId)
          : undefined,
        source: entry.source,
        kind: entry.kind,
        method: entry.method
          ? clampClientErrorText(entry.method, APP_ERROR_LIMITS.method)
          : undefined,
        path: clampClientErrorText(pathWithoutQuery(entry.path), APP_ERROR_LIMITS.path),
        text: clampClientErrorText(entry.text, APP_ERROR_LIMITS.text),
        userAgent: entry.userAgent
          ? clampClientErrorText(entry.userAgent, APP_ERROR_LIMITS.userAgent)
          : undefined,
        occurredAt: now.toJSDate(),
      },
      APP_ERROR_ENCRYPT_SCHEMA,
    );
    await this.model.create(payload);
    await this.trimOverCap();
  }

  /** Оставляет только APP_ERROR_LIMITS.maxRecords самых свежих записей —
   * удаляет старые сверх потолка. Отдельный запрос после вставки, не
   * capped-коллекция: capped не даёт TTL-индекса (retention по времени —
   * тоже требование, шапка app-error.schema.ts), а два независимых предела
   * (по времени и по числу) проще держать явным кодом, чем настройками Mongo. */
  private async trimOverCap(): Promise<void> {
    const total = await this.model.estimatedDocumentCount();
    const over = total - APP_ERROR_LIMITS.maxRecords;
    if (over <= 0) return;

    const oldest = await this.model
      .find({}, { _id: 1 })
      .sort({ occurredAt: 1 })
      .limit(over)
      .lean<{ _id: unknown }[]>();
    if (oldest.length === 0) return;
    await this.model.deleteMany({ _id: { $in: oldest.map((doc) => doc._id) } });
  }
}
