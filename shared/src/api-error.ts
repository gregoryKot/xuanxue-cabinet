// Единый конверт ошибки API (CLAUDE.md, раздел «Ошибки»): его формирует
// DomainExceptionFilter в api и разбирает apiFetch в web. Тип живёт в shared,
// чтобы фронт и бэк не разъехались по форме ответа — расхождение ловит tsc.

/** Коды ошибок, которые отдаёт api. `network` и `unknown` добавляет клиент. */
export type ApiErrorCode =
  | 'invalid_input'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  // Тело запроса больше лимита парсера (1 МБ JSON, `EXAM_IMAGE_LIMITS.maxBytes`
  // у картинки варианта) — отдельный код, чтобы форма загрузки могла
  // отличить «файл велик» от прочих сбоев сервера.
  | 'payload_too_large'
  // Тело запроса не парсится вообще (битый JSON, неподдерживаемый charset)
  // — до ValidationPipe и DTO не доходит, `invalid_input` тут неверен: там
  // JSON распознан, просто поля не прошли проверку (аудит 2026-09-21).
  | 'bad_request'
  // Функция входа выключена конфигурацией (вход через Telegram без
  // BOT_TOKEN) — не ошибка клиента, сервис сам не готов её обслужить.
  | 'not_available'
  | 'internal_error'
  | 'http_error'
  | 'network'
  | 'unknown';

export interface ApiErrorBody {
  statusCode: number;
  code: ApiErrorCode;
  /** Текст для пользователя — на «вы», говорит, что сделать дальше (docs/VOICE.md). */
  message: string;
  /** Построчные замечания ValidationPipe — только при `invalid_input`. */
  details?: string[];
  /** Идентификатор запроса из логов — по нему ищут причину в Railway. */
  requestId?: string;
}
