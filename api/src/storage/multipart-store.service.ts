// Multipart-загрузка в R2 (ADR-0137) — вторая половина FileStoreService,
// вынесена отдельным файлом ради файл-храповика (CLAUDE.md «Храповики»):
// у FileStoreService уже занят почти весь потолок. Свой SigV4 (sigv4.ts),
// без `@aws-sdk/*` — тот же выбор, что ADR-0057. Четыре операции
// S3-совместимого multipart: создать загрузку, положить часть, завершить,
// прервать. Байты части идут через наш инстанс (ADR-0137) — файл ответа
// ученика может быть до 1 ГБ, а часть — 8 МиБ, дольше и капризнее, чем
// короткий PUT материала/видео вопроса, поэтому свой, более длинный таймаут.
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DateTime } from 'luxon';
import { FILE_STORAGE_FAILED_MESSAGE } from '@xuanxue/shared';
import { errorMessage } from '../common/error-info';
import { NotAvailableError } from '../common/errors';
import { objectUrl, readR2Config, type R2Config } from './r2.config';
import { requireR2Config, sendR2Request } from './r2-request';
import { signRequestHeaders } from './sigv4';

// Часть может идти по плохому мобильному каналу — 8 МиБ дольше 60 секунд
// PUT-загрузки короткого файла материала/видео вопроса (FileStoreService).
const PART_TIMEOUT_MS = 120_000;
const CONTROL_TIMEOUT_MS = 30_000;

interface MultipartPart {
  partNumber: number;
  etag: string;
}

export interface CompleteMultipartInput {
  key: string;
  uploadId: string;
  parts: readonly MultipartPart[];
  now: DateTime;
}

export interface UploadPartInput {
  key: string;
  uploadId: string;
  partNumber: number;
  bytes: Buffer;
  now: DateTime;
}

const UPLOAD_ID_RE = /<UploadId>([^<]+)<\/UploadId>/;
const ETAG_HEADER = 'etag';

@Injectable()
export class MultipartStoreService {
  private readonly logger = new Logger(MultipartStoreService.name);

  constructor(private readonly config: ConfigService) {}

  get isEnabled(): boolean {
    return readR2Config(this.config) !== null;
  }

  async createMultipartUpload(
    key: string,
    contentType: string,
    now: DateTime,
  ): Promise<string> {
    const config = this.requireConfig();
    const url = objectUrl(config, key);
    const headers = signRequestHeaders({
      method: 'POST',
      url,
      headers: { 'content-type': contentType },
      body: Buffer.alloc(0),
      query: { uploads: '' },
      now,
      credentials: config.credentials,
    });
    const body = await this.send(
      'POST',
      `${url}?uploads`,
      { headers },
      CONTROL_TIMEOUT_MS,
    );
    const uploadId = UPLOAD_ID_RE.exec(body)?.[1];
    if (!uploadId) {
      this.logger.error('R2 не вернул UploadId на createMultipartUpload');
      throw new NotAvailableError(FILE_STORAGE_FAILED_MESSAGE);
    }
    return uploadId;
  }

  async uploadPart({
    key,
    uploadId,
    partNumber,
    bytes,
    now,
  }: UploadPartInput): Promise<string> {
    const config = this.requireConfig();
    const url = objectUrl(config, key);
    const query = { partNumber: String(partNumber), uploadId };
    const headers = signRequestHeaders({
      method: 'PUT',
      url,
      headers: {},
      body: bytes,
      query,
      now,
      credentials: config.credentials,
    });
    const search = new URLSearchParams(query).toString();
    let res: Response;
    try {
      res = await fetch(`${url}?${search}`, {
        method: 'PUT',
        headers,
        body: bytes,
        signal: AbortSignal.timeout(PART_TIMEOUT_MS),
      });
    } catch (err) {
      this.logger.error(`R2 uploadPart не удался: ${errorMessage(err)}`);
      throw new NotAvailableError(FILE_STORAGE_FAILED_MESSAGE);
    }
    const etag = res.headers.get(ETAG_HEADER);
    if (!res.ok || !etag) {
      this.logger.error(`R2 uploadPart ответил ${res.status} без ETag`);
      throw new NotAvailableError(FILE_STORAGE_FAILED_MESSAGE);
    }
    return etag;
  }

  /** S3-совместимое хранилище может ответить HTTP 200 с `<Error>` в теле —
   * ошибка обнаружилась уже после начала потоковой отдачи ответа, статус
   * назад не откатить. Проверяем тело, не только код (ADR-0137). */
  async completeMultipartUpload({
    key,
    uploadId,
    parts,
    now,
  }: CompleteMultipartInput): Promise<void> {
    const config = this.requireConfig();
    const url = objectUrl(config, key);
    const body = Buffer.from(
      `<CompleteMultipartUpload>${parts
        .map(
          (part) =>
            `<Part><PartNumber>${part.partNumber}</PartNumber><ETag>${part.etag}</ETag></Part>`,
        )
        .join('')}</CompleteMultipartUpload>`,
    );
    const headers = signRequestHeaders({
      method: 'POST',
      url,
      headers: { 'content-type': 'application/xml' },
      body,
      query: { uploadId },
      now,
      credentials: config.credentials,
    });
    const responseBody = await this.send(
      'POST',
      `${url}?uploadId=${encodeURIComponent(uploadId)}`,
      { headers, body },
      CONTROL_TIMEOUT_MS,
    );
    if (responseBody.includes('<Error>')) {
      this.logger.error('R2 ответил 200 с <Error> на completeMultipartUpload');
      throw new NotAvailableError(FILE_STORAGE_FAILED_MESSAGE);
    }
  }

  /** Best-effort вызывающего слоя — брошенная загрузка не блокирует основной
   * поток (замена файла, удаление аккаунта); отказ здесь оставляет часть
   * оплаченного R2-хранилища брошенной части, не пользовательскую операцию. */
  async abortMultipartUpload(
    key: string,
    uploadId: string,
    now: DateTime,
  ): Promise<void> {
    const config = this.requireConfig();
    const url = objectUrl(config, key);
    const headers = signRequestHeaders({
      method: 'DELETE',
      url,
      headers: {},
      body: Buffer.alloc(0),
      query: { uploadId },
      now,
      credentials: config.credentials,
    });
    await this.send(
      'DELETE',
      `${url}?uploadId=${encodeURIComponent(uploadId)}`,
      { headers },
      CONTROL_TIMEOUT_MS,
    );
  }

  private requireConfig(): R2Config {
    return requireR2Config(this.config);
  }

  /** Общий сетевой запрос — r2-request.ts (доля с FileStoreService,
   * jscpd-храповик). В отличие от FileStoreService.send, тело ответа нужно
   * вызывающим (UploadId, `<Error>`). */
  private async send(
    method: string,
    url: string,
    init: { headers: Record<string, string>; body?: Buffer },
    timeoutMs: number,
  ): Promise<string> {
    return sendR2Request(this.logger, method, url, init, timeoutMs);
  }
}
