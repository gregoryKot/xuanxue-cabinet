// Фейковая multipart-загрузка для e2e (ADR-0137) — тот же приём, что
// FakeFileStore: настоящий AppModule, но вместо R2 — Map в памяти. Части
// склеиваются в один Buffer на `complete`, ETag — детерминированный хеш
// части (порядок и содержимое важны для теста, не сам алгоритм).
import { createHash, randomUUID } from 'crypto';
import type { DateTime } from 'luxon';
import { NotAvailableError } from '../../src/common/errors';
import { FILE_STORAGE_OFF_MESSAGE } from '@xuanxue/shared';
import type {
  CompleteMultipartInput,
  UploadPartInput,
} from '../../src/storage/multipart-store.service';

interface PendingUpload {
  key: string;
  parts: Map<number, Buffer>;
}

export class FakeMultipartStore {
  enabled = true;
  readonly uploads = new Map<string, PendingUpload>();
  readonly objects = new Map<string, Buffer>();
  readonly aborted: string[] = [];

  get isEnabled(): boolean {
    return this.enabled;
  }

  createMultipartUpload(
    key: string,
    _contentType: string,
    _now: DateTime,
  ): Promise<string> {
    this.require();
    const uploadId = randomUUID();
    this.uploads.set(uploadId, { key, parts: new Map() });
    return Promise.resolve(uploadId);
  }

  uploadPart({ uploadId, partNumber, bytes }: UploadPartInput): Promise<string> {
    this.require();
    const upload = this.uploads.get(uploadId);
    if (!upload) throw new Error('fake multipart: неизвестный uploadId');
    upload.parts.set(partNumber, bytes);
    return Promise.resolve(`"${createHash('md5').update(bytes).digest('hex')}"`);
  }

  completeMultipartUpload({
    uploadId,
    key,
    parts,
  }: CompleteMultipartInput): Promise<void> {
    this.require();
    const upload = this.uploads.get(uploadId);
    if (!upload) throw new Error('fake multipart: неизвестный uploadId на complete');
    const ordered = [...parts]
      .sort((a, b) => a.partNumber - b.partNumber)
      .map((part) => upload.parts.get(part.partNumber));
    if (ordered.some((buf) => !buf)) throw new Error('fake multipart: часть пропала');
    this.objects.set(key, Buffer.concat(ordered as Buffer[]));
    this.uploads.delete(uploadId);
    return Promise.resolve();
  }

  abortMultipartUpload(_key: string, uploadId: string, _now: DateTime): Promise<void> {
    this.require();
    this.uploads.delete(uploadId);
    this.aborted.push(uploadId);
    return Promise.resolve();
  }

  private require(): void {
    if (!this.enabled) throw new NotAvailableError(FILE_STORAGE_OFF_MESSAGE);
  }
}
