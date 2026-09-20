// Фейковое хранилище объектов для e2e (ADR-0057) — тот же приём, что у
// FakeMailService и фейкового TelegramClientFactory: настоящий AppModule, но
// вместо сети — Map в памяти. В R2 из тестов не ходим никогда.
//
// `enabled` меняется прямо в тесте: «хранилище не подключено» — отдельная
// ветка поведения (ADR-0057), и поднимать ради неё второе приложение дорого.
import type { DateTime } from 'luxon';
import type {
  PutObjectInput,
  SignedDownload,
} from '../../src/storage/file-store.service';
import { NotAvailableError } from '../../src/common/errors';
import { FILE_STORAGE_OFF_MESSAGE } from '@xuanxue/shared';

export interface StoredObject {
  bytes: Buffer;
  contentType: string;
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
    if (download) url.searchParams.set('response-content-type', download.contentType);
    return url.toString();
  }

  private require(): void {
    if (!this.enabled) throw new NotAvailableError(FILE_STORAGE_OFF_MESSAGE);
  }
}
