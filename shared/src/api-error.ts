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
