// Заголовок версии сборки на каждом ответе API. Вкладку кабинета держат
// открытой неделями (ADR-0076), а деплой уезжает по нескольку раз в день —
// человек смотрит на старую сборку и думает, что правка пропала (жалоба
// владельца 2026-09-21). Это первая половина решения (ADR-0099): фронт
// сравнивает значение с первым увиденным и предлагает перезагрузиться —
// вторая половина, здесь сервер только сообщает, что у него сейчас собрано.
import { APP_VERSION_HEADER } from '@xuanxue/shared';

/** Часть Express-ответа, которая здесь нужна — тот же приём, что
 * `RawUploadResponse` в raw-upload-concurrency.ts: локальный «*Like»-тип
 * вместо импорта типов express, чтобы фабрику можно было протестировать
 * без поднятия HTTP-сервера. */
interface AppVersionResponseLike {
  setHeader(name: string, value: string): unknown;
}

/**
 * Возвращает express-middleware, которая ставит заголовок версии сборки на
 * каждый ответ. `version` — короткий SHA коммита (health-commit.ts) из
 * `RAILWAY_GIT_COMMIT_SHA`; локально и в обычном docker-смоке CI этой
 * переменной нет — тогда `version === undefined`, и заголовок не ставится
 * вовсе: версии нет, врать о ней нечего, а её отсутствие уже само по себе
 * сигнал (RUNBOOK §2 п.1 сверяет commit только там, где переменная задана).
 */
export function makeAppVersionHeader(
  version: string | undefined,
): (req: unknown, res: AppVersionResponseLike, next: () => void) => void {
  return (_req, res, next): void => {
    if (version !== undefined) {
      res.setHeader(APP_VERSION_HEADER, version);
    }
    next();
  };
}
