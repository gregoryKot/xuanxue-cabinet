// Тело `PATCH /me/notifications/lessons/sync` до разбора (ADR-0185): сырой текст
// только для этого маршрута, чтобы контракт «повтор ключа JSON — ошибка» не
// зависел от глобального парсера. Тот же приём, что у сырых загрузок
// (exam-image-body.ts, app.setup.ts): предикат маршрута и метода включает
// парсер, остальные запросы его не видят.
//
// Парсер включается по методу и пути, а не по `Content-Type`: тело с чужим типом
// (`text/plain`, форма) тоже должно дойти до обработчика как есть и получить 415
// от него, а не молча уйти в глобальный JSON-парсер или в никуда. Тело, уже
// прочитанное парсером, глобальный `json` пропускает: body-parser видит, что
// запрос дочитан (`isFinished`), и вызывает `next()`. Парсер стоит в
// app.setup.ts раньше глобального — порядок там и записан.
import type { NestExpressApplication } from '@nestjs/platform-express';
import { REMINDER_SYNC_MAX_BODY_BYTES, type ReminderChange } from '@xuanxue/shared';
import { setNoStoreMiddleware } from '../auth/session-check.controller';
import { InvalidInputError, UnsupportedMediaTypeError } from '../common/errors';
import { routePath, type IncomingRequestLike } from '../common/raw-body-route';
import { parseStrictJson, StrictJsonError } from '../common/strict-json';
import { parseReminderPatch } from './reminder-sync-patch';

const REMINDER_SYNC_PATH = '/api/me/notifications/lessons/sync';

/** Единственный разрешённый вид: JSON, а из параметров — только UTF-8. */
const JSON_UTF8_RE = /^application\/json(?:\s*;\s*charset\s*=\s*"?utf-8"?)?\s*$/i;

const MEDIA_TYPE_MESSAGE =
  'Отправьте изменения как JSON в кодировке UTF-8 с заголовком Content-Type: application/json.';
const MISSING_BODY_MESSAGE =
  'В запросе нет тела с изменениями. Добавьте его и отправьте снова.';
const BROKEN_BODY_MESSAGE =
  'Тело запроса не удалось прочитать как JSON: проверьте синтаксис и что ни один ключ не повторяется.';

// `ignoreBOM: true` оставляет BOM в тексте, и строгий разбор его отклоняет, как
// `JSON.parse`; по умолчанию декодер молча срезал бы его.
const UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

type NoStoreResponse = Parameters<typeof setNoStoreMiddleware>[1];

/** Запрос для предикатов и чтения тела: структурный минимум вместо типов Express. */
export interface ReminderPatchRequestLike {
  headers: { 'content-type'?: string | string[] | undefined };
  body?: unknown;
}

/** Путь сравнивается без регистра и без завершающего слэша: роутер Express их
 * не различает, и запрос на `/API/ME/…` дошёл бы до обработчика мимо сырого
 * парсера. */
export function isReminderSyncPatch(req: IncomingRequestLike): boolean {
  return (
    (req.method ?? '').toUpperCase() === 'PATCH' &&
    routePath(req.url).toLowerCase() === REMINDER_SYNC_PATH
  );
}

/** Сырое тело маршрута до глобального JSON-парсера. `no-store` ставится здесь же:
 * отказ парсера (413) пишет фильтр, минуя middleware модуля уведомлений. */
export function configureReminderSyncBody(app: NestExpressApplication): void {
  app.use((req: IncomingRequestLike, res: NoStoreResponse, next: () => void) => {
    if (!isReminderSyncPatch(req)) return next();
    setNoStoreMiddleware(req, res, next);
  });
  app.useBodyParser('raw', {
    type: isReminderSyncPatch,
    limit: REMINDER_SYNC_MAX_BODY_BYTES,
  });
}

/** Тип, текст, строгий JSON, форма — в таком порядке; бросает 415 или 400.
 * Тело не-`Buffer` значит, что его прочёл не наш парсер (обход предиката): такое
 * не разбираем, иначе повтор ключа уже потерян. */
export function readReminderPatch(req: ReminderPatchRequestLike): ReminderChange[] {
  const contentType = req.headers['content-type'];
  if (typeof contentType !== 'string' || !JSON_UTF8_RE.test(contentType)) {
    throw new UnsupportedMediaTypeError(MEDIA_TYPE_MESSAGE);
  }
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    throw new InvalidInputError(MISSING_BODY_MESSAGE);
  }
  return parseReminderPatch(parseBodyText(decodeUtf8(req.body)));
}

// Декодер при неверных байтах бросает своё исключение, поэтому ловится любое:
// другой причины у него нет. Текст исключения наружу не идёт.
function decodeUtf8(bytes: Buffer): string {
  try {
    return UTF8.decode(bytes);
  } catch {
    throw new InvalidInputError(BROKEN_BODY_MESSAGE);
  }
}

// Текст исключения строгого разбора — позиция в теле, наружу не идёт: тело
// может нести чужой выбор, а нужное клиенту сказано в сообщении.
function parseBodyText(text: string): unknown {
  try {
    return parseStrictJson(text);
  } catch (err) {
    if (err instanceof StrictJsonError) throw new InvalidInputError(BROKEN_BODY_MESSAGE);
    throw err;
  }
}
