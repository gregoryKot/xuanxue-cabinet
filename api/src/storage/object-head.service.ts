// Размер объекта в R2 без скачивания — `HEAD` по ключу. Нужен, чтобы повтор
// `complete` видео (ADR-0165, F47) отличил «загрузку уже собрали, а отметку
// записать не успели» от «загрузки больше нет»: R2 на оба случая отвечает
// NoSuchUpload, а объект либо лежит с нужным размером, либо нет. Отдельный
// сервис, а не метод FileStoreService/MultipartStoreService: оба уже у
// потолка файл-храповика (CLAUDE.md «Храповики»). Своя подпись SigV4
// (sigv4.ts), без `@aws-sdk/*` — тот же выбор, что ADR-0057.
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DateTime } from 'luxon';
import { FILE_STORAGE_FAILED_MESSAGE } from '@xuanxue/shared';
import { errorMessage } from '../common/error-info';
import { NotAvailableError } from '../common/errors';
import { objectUrl } from './r2.config';
import { requireR2Config } from './r2-request';
import { signRequestHeaders } from './sigv4';

const HEAD_TIMEOUT_MS = 10_000;
const HTTP_NOT_FOUND = 404;
const CONTENT_LENGTH_HEADER = 'content-length';

@Injectable()
export class ObjectHeadService {
  private readonly logger = new Logger(ObjectHeadService.name);

  constructor(private readonly config: ConfigService) {}

  /** Размер объекта в байтах; `null` — объекта нет (или хранилище не назвало
   * размер: сверить нечего, вызывающий считает это «нет»). Любой другой отказ
   * — NotAvailableError: «не знаем» нельзя выдавать за «нет». */
  async sizeBytes(key: string, now: DateTime): Promise<number | null> {
    const config = requireR2Config(this.config);
    const url = objectUrl(config, key);
    const headers = signRequestHeaders({
      method: 'HEAD',
      url,
      headers: {},
      body: Buffer.alloc(0),
      now,
      credentials: config.credentials,
    });
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'HEAD',
        headers,
        signal: AbortSignal.timeout(HEAD_TIMEOUT_MS),
      });
    } catch (err) {
      this.logger.error(`R2 HEAD не удался: ${errorMessage(err)}`);
      throw new NotAvailableError(FILE_STORAGE_FAILED_MESSAGE);
    }
    if (res.status === HTTP_NOT_FOUND) return null;
    if (!res.ok) {
      this.logger.error(`R2 ответил ${res.status} на HEAD`);
      throw new NotAvailableError(FILE_STORAGE_FAILED_MESSAGE);
    }
    const header = res.headers.get(CONTENT_LENGTH_HEADER);
    const size = header === null ? Number.NaN : Number(header);
    return Number.isInteger(size) ? size : null;
  }
}
