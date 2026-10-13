// Потоковое чтение объекта R2 (ADR-0182): байты не складываются в память — 50 МБ
// видео на запрос инстанс не держит. Вынесено из FileStoreService ради лимита
// файла и чтобы подпись GET (с `range` или без) жила в одном месте.
import type { Logger } from '@nestjs/common';
import { Readable } from 'node:stream';
import type { DateTime } from 'luxon';
import { FILE_STORAGE_FAILED_MESSAGE } from '@xuanxue/shared';
import { NotAvailableError } from '../common/errors';
import { objectUrl, type R2Config } from './r2.config';
import { fetchR2 } from './r2-request';
import { signRequestHeaders } from './sigv4';

export const DOWNLOAD_TIMEOUT_MS = 60_000;

/** Ответ R2 на чтение объекта: статус 200 (целиком) или 206 (часть) и заголовки,
 * которые нужны декодеру в браузере. */
export interface ObjectStream {
  status: number;
  contentType: string | undefined;
  contentLength: string | undefined;
  contentRange: string | undefined;
  body: Readable;
}

/** Подписанный GET объекта; `range` входит в подпись — R2 примет его только
 * вместе с ней. */
export function signObjectGet(
  config: R2Config,
  key: string,
  now: DateTime,
  range?: string,
): { url: string; headers: Record<string, string> } {
  const url = objectUrl(config, key);
  const headers = signRequestHeaders({
    method: 'GET',
    url,
    headers: range ? { range } : {},
    body: Buffer.alloc(0),
    now,
    credentials: config.credentials,
  });
  return { url, headers };
}

export async function fetchObjectStream(
  logger: Logger,
  config: R2Config,
  input: { key: string; now: DateTime; range?: string },
): Promise<ObjectStream> {
  const { url, headers } = signObjectGet(config, input.key, input.now, input.range);
  const res = await fetchR2(logger, 'GET', url, { headers }, DOWNLOAD_TIMEOUT_MS);
  if (!res.body) throw new NotAvailableError(FILE_STORAGE_FAILED_MESSAGE);
  return {
    status: res.status,
    contentType: res.headers.get('content-type') ?? undefined,
    contentLength: res.headers.get('content-length') ?? undefined,
    contentRange: res.headers.get('content-range') ?? undefined,
    body: Readable.fromWeb(res.body),
  };
}
