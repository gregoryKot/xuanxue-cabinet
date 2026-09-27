// Общая часть двух адаптеров R2 (FileStoreService/MultipartStoreService,
// ADR-0057/ADR-0137) — конфигурация и сам сетевой запрос повторялись бы
// иначе дословно (CLAUDE.md «Дубли и мёртвый код», jscpd-храповик). Тело
// ответа читается всегда: FileStoreService его игнорирует,
// MultipartStoreService разбирает (UploadId, `<Error>`). В лог тело не идёт —
// в нём мог бы повториться ключ объекта, а рядом в строке лога уже есть
// метод и статус для поиска.
import type { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { FILE_STORAGE_FAILED_MESSAGE, FILE_STORAGE_OFF_MESSAGE } from '@xuanxue/shared';
import { errorMessage } from '../common/error-info';
import { NotAvailableError } from '../common/errors';
import { readR2Config, type R2Config } from './r2.config';

export function requireR2Config(config: ConfigService): R2Config {
  const found = readR2Config(config);
  if (!found) throw new NotAvailableError(FILE_STORAGE_OFF_MESSAGE);
  return found;
}

/** Запрос к R2 и проверка статуса; ответ отдаётся целиком — бинарное тело
 * (видео для бота, `FileStoreService.get`) строкой читать нельзя. */
export async function fetchR2(
  logger: Logger,
  method: string,
  url: string,
  init: { headers: Record<string, string>; body?: Buffer },
  timeoutMs: number,
): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: init.headers,
      body: init.body,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    logger.error(`R2 ${method} не удался: ${errorMessage(err)}`);
    throw new NotAvailableError(FILE_STORAGE_FAILED_MESSAGE);
  }
  if (!res.ok) {
    await res.text().catch(() => '');
    logger.error(`R2 ответил ${res.status} на ${method}`);
    throw new NotAvailableError(FILE_STORAGE_FAILED_MESSAGE);
  }
  return res;
}

export async function sendR2Request(
  logger: Logger,
  method: string,
  url: string,
  init: { headers: Record<string, string>; body?: Buffer },
  timeoutMs: number,
): Promise<string> {
  const res = await fetchR2(logger, method, url, init, timeoutMs);
  return res.text().catch(() => '');
}
