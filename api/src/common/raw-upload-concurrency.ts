// Мера 2 против буферизации сырого тела до гвардов (SECURITY §4, ADR-0083).
// Мера 1 (raw-body-session.ts) закрывает неавторизованный поток: без
// подписанной сессии предикат не включает сырой парсер вовсе. Но роль
// синхронно не проверить (она в БД), поэтому свой ученик с валидной
// сессией — или чужой со случайно утёкшей cookie — всё ещё может занять
// память инстанса параллельными загрузками: тело держится в Buffer целиком,
// пока идёт запрос. Здесь — потолок на число таких запросов «в полёте»
// одновременно, один общий счётчик на оба маршрута сырого тела (картинка
// варианта, файл материала): бюджет памяти один на процесс, делить его по
// маршруту незачем.
//
// Ставится в app.setup.ts ДО обоих app.useBodyParser('raw', ...) — если бы
// счётчик стоял после парсера, тело уже было бы в памяти к моменту отказа.
// Гварды сюда не доходят (эта middleware работает раньше самого Nest), а
// значит ответ на отказ собираем сами, конвертом ApiErrorBody, — единственное
// такое место во всей мере.
import { HttpStatus } from '@nestjs/common';
import type { ApiErrorBody } from '@xuanxue/shared';
import { incomingRequestId, REQUEST_ID_HEADER } from './request-info';
import type { IncomingRequestLike } from './raw-body-route';

/** 4 одновременных сырых загрузки — до 120 МБ Buffer-памяти разом
 * (MATERIAL_FILE_LIMITS.maxBytes × 4, худший случай — все четыре файла
 * материалов). Учитель кладёт файлы по одному, ученик грузит картинку
 * варианта раз в попытку — параллельный поток такого размера означает
 * либо несколько человек штата одновременно, либо чужой скрипт с утёкшей
 * cookie; отказ здесь дешевле упавшего по памяти инстанса. */
export const RAW_UPLOAD_CONCURRENCY_LIMIT = 4;

/** Подсказка клиенту, через сколько секунд повторить — не расчёт очереди
 * (она не видна изнутри одной express-middleware), а мягкий ориентир:
 * обычная загрузка в несколько мегабайт с домашнего интернета укладывается
 * в секунды. */
const RETRY_AFTER_SEC = 10;

// VOICE.md: что случилось и что делать. «Другая загрузка» — конкретика
// вместо «сервис перегружен»: учитель понимает, что дело не в его файле.
const TOO_MANY_UPLOADS_MESSAGE =
  'Сейчас идёт другая загрузка. Подождите немного и попробуйте ещё раз.';

/** Совпадение с одним из предикатов сырого тела (material-file-body.ts,
 * exam-image-body.ts) — список маршрутов не дублируется здесь (CLAUDE.md
 * «Дубли и мёртвый код»), вызывающий (app.setup.ts) передаёт их «или». */
export type RawUploadMatcher = (req: IncomingRequestLike) => boolean;

/** `IncomingRequestLike` не несёт `x-request-id` — он там не нужен ни
 * одному предикату. Здесь нужен: requestId для конверта ошибки берётся тем
 * же способом, что и логирование (common/request-info.ts), а pino-http
 * ещё не отработал — эта middleware стоит раньше него в стеке. */
interface RawUploadRequest extends IncomingRequestLike {
  headers: IncomingRequestLike['headers'] & {
    'x-request-id'?: string | string[] | undefined;
  };
}

/** Часть Express-ответа, которая здесь нужна — тот же приём, что ResponseLike
 * в domain-exception.filter.ts и common/http-headers.ts, плюс `set()` для
 * `Retry-After` и `once()`, чтобы освободить слот и на `finish`, и на
 * `close`. */
interface RawUploadResponse {
  status(code: number): RawUploadResponse;
  set(name: string, value: string): RawUploadResponse;
  json(body: ApiErrorBody): unknown;
  once(event: 'finish' | 'close', listener: () => void): unknown;
}

/**
 * Считает запросы «в полёте», совпавшие с `matches`, и отказывает сверх
 * `limit`. Слот освобождается ровно один раз на запрос: `released` в
 * замыкании страхует от двойного вычитания, если `finish` и `close`
 * пришли оба (оборванное соединение после успешного ответа — редкость, но
 * не невозможность).
 */
export function makeRawUploadConcurrencyLimit(
  matches: RawUploadMatcher,
  limit: number = RAW_UPLOAD_CONCURRENCY_LIMIT,
): (req: RawUploadRequest, res: RawUploadResponse, next: () => void) => void {
  let inFlight = 0;

  return (req, res, next): void => {
    if (!matches(req)) {
      next();
      return;
    }

    if (inFlight >= limit) {
      const body: ApiErrorBody = {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        code: 'not_available',
        message: TOO_MANY_UPLOADS_MESSAGE,
        requestId: incomingRequestId(req.headers[REQUEST_ID_HEADER]),
      };
      res
        .status(HttpStatus.SERVICE_UNAVAILABLE)
        .set('Retry-After', String(RETRY_AFTER_SEC))
        .json(body);
      return;
    }

    inFlight += 1;
    let released = false;
    const release = (): void => {
      if (released) return;
      released = true;
      inFlight -= 1;
    };
    res.once('finish', release);
    res.once('close', release);
    next();
  };
}
