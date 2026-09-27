// Адаптер объектного хранилища (ADR-0057): положить объект, удалить объект,
// выдать подписанную ссылку на скачивание. Работает через `fetch` и свою
// подпись SigV4 (sigv4.ts) — без `@aws-sdk/*`, тот же приём, что у почты
// (ADR-0029, Resend через fetch без SDK).
//
// Хранилище необязательно: без четырёх переменных R2 сервис отвечает
// `isEnabled === false`, и вызывающий код прячет загрузку с экрана, а не
// падает (r2.config.ts).
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DateTime } from 'luxon';
import { objectUrl, readR2Config, type R2Config } from './r2.config';
import { requireR2Config, sendR2Request } from './r2-request';
import { encodeRfc3986 } from './sigv4-canonical';
import { presignGetUrl, signRequestHeaders } from './sigv4';

// Загрузка идёт с нашего инстанса и ограничена потолком размера файла,
// который ставит вызывающий домен. Десяти секунд, как у почты
// (mail.service.ts), тут мало: десятки мегабайт по плохому каналу.
const UPLOAD_TIMEOUT_MS = 60_000;
const DELETE_TIMEOUT_MS = 10_000;

export interface PutObjectInput {
  key: string;
  bytes: Buffer;
  contentType: string;
  now: DateTime;
}

/** Чем хранилище отдаст файл браузеру. Без этого браузер сохранил бы объект
 * под его ключом — `3f1a4c9e-…` без расширения. */
export interface SignedDownload {
  name: string;
  contentType: string;
}

/** `filename*` по RFC 5987, а не `filename=` — имя методички кириллицей в
 * заголовке иначе не живёт. Кодирование то же, что у пути объекта. */
function downloadParams({ name, contentType }: SignedDownload): Record<string, string> {
  return {
    'response-content-type': contentType,
    'response-content-disposition': `attachment; filename*=UTF-8''${encodeRfc3986(name)}`,
  };
}

@Injectable()
export class FileStoreService {
  private readonly logger = new Logger(FileStoreService.name);

  constructor(private readonly config: ConfigService) {}

  /** Подключено ли хранилище — по нему экран решает, показывать ли загрузку
   * (ADR-0057), а не по попытке загрузить и ошибке в ответ. */
  get isEnabled(): boolean {
    return readR2Config(this.config) !== null;
  }

  async put({ key, bytes, contentType, now }: PutObjectInput): Promise<void> {
    const config = this.requireConfig();
    const url = objectUrl(config, key);
    const headers = signRequestHeaders({
      method: 'PUT',
      url,
      headers: { 'content-type': contentType },
      body: bytes,
      now,
      credentials: config.credentials,
    });
    await this.send('PUT', url, { headers, body: bytes }, UPLOAD_TIMEOUT_MS);
  }

  /** Удаление объекта. S3-совместимое `DELETE` идемпотентно: второй вызов на
   * уже удалённый ключ отвечает 204 — повтор уборщика (ADR-0057) не считается
   * ошибкой и не требует проверки «а есть ли он ещё». */
  async remove(key: string, now: DateTime): Promise<void> {
    const config = this.requireConfig();
    const url = objectUrl(config, key);
    const headers = signRequestHeaders({
      method: 'DELETE',
      url,
      headers: {},
      body: Buffer.alloc(0),
      now,
      credentials: config.credentials,
    });
    await this.send('DELETE', url, { headers }, DELETE_TIMEOUT_MS);
  }

  /** Ссылка живёт минуты: право проверено до её выдачи, и переслать её
   * вместо приглашения в школу не выйдет (ADR-0057). Байты идут мимо нашего
   * инстанса — ради этого R2 и брали. */
  signedGetUrl(
    key: string,
    expiresInSeconds: number,
    now: DateTime,
    download?: SignedDownload,
  ): string {
    const config = this.requireConfig();
    return presignGetUrl({
      url: objectUrl(config, key),
      params: download ? downloadParams(download) : {},
      expiresInSeconds,
      now,
      credentials: config.credentials,
    });
  }

  private requireConfig(): R2Config {
    return requireR2Config(this.config);
  }

  /** Общий сетевой запрос — r2-request.ts (доля с MultipartStoreService,
   * ADR-0137, jscpd-храповик). Тело ответа этому адаптеру не нужно. */
  private async send(
    method: string,
    url: string,
    init: { headers: Record<string, string>; body?: Buffer },
    timeoutMs: number,
  ): Promise<void> {
    await sendR2Request(this.logger, method, url, init, timeoutMs);
  }
}
