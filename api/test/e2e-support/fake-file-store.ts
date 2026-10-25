// Фейковое хранилище объектов для e2e (ADR-0057) — тот же приём, что у
// FakeMailService и фейкового TelegramClientFactory: настоящий AppModule, но
// вместо сети — Map в памяти. В R2 из тестов не ходим никогда.
//
// `enabled` меняется прямо в тесте: «хранилище не подключено» — отдельная
// ветка поведения (ADR-0057), и поднимать ради неё второе приложение дорого.
import { Readable } from 'node:stream';
import type { DateTime } from 'luxon';
import type {
  ObjectStream,
  PutObjectInput,
  SignedDownload,
} from '../../src/storage/file-store.service';
import { NotAvailableError } from '../../src/common/errors';
import { FILE_STORAGE_OFF_MESSAGE } from '@xuanxue/shared';

export interface StoredObject {
  bytes: Buffer;
  contentType: string;
}

function streamOf(
  object: StoredObject,
  status: number,
  slice: Buffer,
  contentRange?: string,
): ObjectStream {
  return {
    status,
    contentType: object.contentType,
    contentLength: String(slice.length),
    contentRange,
    body: Readable.from([slice]),
  };
}

export class FakeFileStore {
  readonly objects = new Map<string, StoredObject>();
  enabled = true;
  /** Сколько раз хранилище отказало подряд — нужно тесту «удалить не вышло,
   * ключ остался журналу» (ADR-0079). */
  failRemove = false;

  get isEnabled(): boolean {
    return this.enabled;
  }

  put({ key, bytes, contentType }: PutObjectInput): Promise<void> {
    this.require();
    this.objects.set(key, { bytes, contentType });
    return Promise.resolve();
  }

  remove(key: string, _now: DateTime): Promise<void> {
    this.require();
    if (this.failRemove) return Promise.reject(new Error('R2 недоступен'));
    this.objects.delete(key);
    return Promise.resolve();
  }

  // Бот скачивает видео этим методом (2026-09-27, «Уточнено» ADR-0133) — HTTP
  // e2e его не зовёт (раздача видео там — signedGetUrl), но фейк держит
  // полный интерфейс FileStoreService, чтобы typecheck не разъезжался молча.
  get(key: string, _now: DateTime): Promise<Buffer> {
    this.require();
    const object = this.objects.get(key);
    if (!object) return Promise.reject(new NotAvailableError(FILE_STORAGE_OFF_MESSAGE));
    return Promise.resolve(object.bytes);
  }

  // Байты потоком с Range (ADR-0182): как R2 — 206 и `Content-Range: bytes a-b/total`
  // на части, 200 на весь объект. Три формы Range те же, что пропускает
  // parseVideoRange; конец за пределами объекта обрезается, как у S3.
  getStream(key: string, _now: DateTime, range?: string): Promise<ObjectStream> {
    this.require();
    const object = this.objects.get(key);
    if (!object) return Promise.reject(new NotAvailableError(FILE_STORAGE_OFF_MESSAGE));
    const total = object.bytes.length;
    const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
    if (!match) return Promise.resolve(streamOf(object, 200, object.bytes));
    const [, from = '', to = ''] = match;
    const start = from === '' ? Math.max(total - Number(to), 0) : Number(from);
    const end = from === '' || to === '' ? total - 1 : Math.min(Number(to), total - 1);
    const slice = object.bytes.subarray(start, end + 1);
    return Promise.resolve(
      streamOf(object, 206, slice, `bytes ${start}-${end}/${total}`),
    );
  }

  signedGetUrl(
    key: string,
    expiresInSeconds: number,
    _now: DateTime,
    download?: SignedDownload,
  ): string {
    this.require();
    const url = new URL(`https://fake-r2.example/${key}`);
    url.searchParams.set('X-Amz-Expires', String(expiresInSeconds));
    url.searchParams.set('X-Amz-Signature', 'f'.repeat(64));
    if (download) {
      // Те же два параметра ответа, что подписывает настоящий адаптер
      // (file-store.service.ts, downloadParams): e2e видит, что скачивание
      // дошло до хранилища, не вынимая подпись.
      url.searchParams.set('response-content-type', download.contentType);
      url.searchParams.set(
        'response-content-disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(download.name)}`,
      );
    }
    return url.toString();
  }

  private require(): void {
    if (!this.enabled) throw new NotAvailableError(FILE_STORAGE_OFF_MESSAGE);
  }
}
