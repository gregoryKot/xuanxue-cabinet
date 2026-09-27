// Журнал сбоев (ADR-0132): до него текст ошибки жил только в логах Railway,
// и каждый алёрт «Сбой в браузере»/«Сбой в кабинете» (ADR-0071, ADR-0053)
// требовал похода туда. Экран «Сбои» открыт только роли `admin` — в
// интерфейсе она и подписана «Разработчик» (auth.ts, ROLE_LABELS).
//
// Общий контракт api/web: query-DTO в api объявляется как
// `implements ListAppErrorsQuery`, расхождение ловит tsc (CLAUDE.md «Слои»).
// Виды браузера совпадают с CLIENT_ERROR_KINDS (client-errors.ts) — сверку
// держит app-errors.spec.ts.

/** Откуда пришёл сбой: отчёт браузера (`POST /api/client-errors`) или
 * неизвестная ошибка сервера (500 из DomainExceptionFilter). */
export const APP_ERROR_SOURCES = ['browser', 'server'] as const;
export type AppErrorSource = (typeof APP_ERROR_SOURCES)[number];

/** Вид сбоя. У браузера — вид из отчёта; у сервера вид один. */
export const APP_ERROR_KINDS = ['render', 'unhandled', 'chunk', 'server'] as const;
export type AppErrorKind = (typeof APP_ERROR_KINDS)[number];

/** Вид сбоя одной фразой для владельца, со строчной — встаёт в середину
 * фразы алёрта Telegram; экран «Сбои» поднимает первую букву сам. Без слов
 * «исключение» и «промис» (docs/VOICE.md). */
export const APP_ERROR_KIND_LABELS: Record<AppErrorKind, string> = {
  render: 'экран не нарисовался',
  unhandled: 'ошибка вне рендера',
  chunk: 'не догрузился код экрана',
  server: 'ошибка сервера',
};

export const APP_ERROR_LIMITS = {
  /** Столько знаков текста ошибки хранит журнал — как в логе (ADR-0071). */
  text: 300,
  /** Адрес экрана или путь запроса без query. */
  path: 200,
  /** Метод HTTP у серверного сбоя. */
  method: 10,
  /** User-Agent: по нему видно браузер и телефон, хвост не нужен. */
  userAgent: 200,
  /** Код обращения — uuid pino-http или заголовок x-request-id клиента. */
  requestId: 100,
  /** Сколько живёт запись: дольше месяца сбой никто не разбирает. */
  retentionDays: 30,
  /** Потолок записей в журнале: флуд отчётов из браузера не раздувает базу. */
  maxRecords: 5000,
  /** Список: по умолчанию и максимум (CLAUDE.md «API»). */
  defaultLimit: 50,
  maxLimit: 200,
} as const;

/** Адрес экрана журнала — и маршрут web, и ссылка из алёрта Telegram. */
export const APP_ERRORS_SCREEN_PATH = '/dev/errors';

/** Query `GET /api/dev/errors`. */
export interface ListAppErrorsQuery {
  requestId?: string;
  source?: AppErrorSource;
  kind?: AppErrorKind;
  limit?: number;
}

export interface AppErrorDto {
  id: string;
  requestId?: string;
  source: AppErrorSource;
  kind: AppErrorKind;
  /** Только у серверного сбоя. */
  method?: string;
  path: string;
  text: string;
  userAgent?: string;
  /** ISO 8601 UTC с `Z`. */
  occurredAt: string;
}

export interface AppErrorListDto {
  items: AppErrorDto[];
  /** Число сбоев за последние 24 часа без `chunk` — число раздела
   * (CLAUDE.md «Продуктовая фича = число в своём разделе»). */
  last24h: number;
}
