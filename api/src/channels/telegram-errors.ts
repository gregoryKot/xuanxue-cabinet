// Классификация ошибок Bot API — вынесена из telegram.adapter.ts (файл-лимит
// 150 строк, CLAUDE.md «Храповики»). Чистые функции без сети и DI: один код
// ответа Telegram покрывает разные причины отказа («message is too long» и
// «chat not found» — оба 400), поэтому текст для учителя строится по
// `description`, а не только по коду (аудит M2, docs/audits/2026-09-12-quality-audit.md).
export interface TelegramApiErrorLike {
  readonly code: number;
  readonly description?: string;
  readonly parameters?: { readonly retry_after?: number };
}

export function isTelegramApiError(err: unknown): err is TelegramApiErrorLike {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof err.code === 'number'
  );
}

// Отказ самого идентификатора файла: «wrong file identifier», «wrong remote
// file identifier», «wrong file_id», FILE_REFERENCE_EXPIRED. «file is too big»
// сюда не попадает — байты тот же лимит не обойдут (аудит 2026-10-01, F02).
const REJECTED_FILE_ID_PATTERN = /file[_ ]id|file identifier|file[_ ]reference/i;

/** Telegram не принял сам file_id (сменили бота, файл пропал у Telegram) —
 * только тогда имеет смысл слать заново байтами. 429, 5xx, сеть и таймаут
 * — нет: повтор с чтением объекта из R2 получит тот же отказ (F02). */
export function isRejectedFileIdError(err: unknown): boolean {
  return (
    isTelegramApiError(err) &&
    err.code === 400 &&
    REJECTED_FILE_ID_PATTERN.test(err.description ?? '')
  );
}

export const NOT_ADMIN_MESSAGE =
  'Бот не админ канала. Добавьте бота администратором и повторите тест.';
export const CHAT_NOT_FOUND_MESSAGE = 'Чат не найден. Проверьте адрес канала.';
export const TEMPORARY_MESSAGE = 'Telegram временно недоступен. Повторите позже.';
const MESSAGE_TOO_LONG_MESSAGE =
  'Пост длиннее лимита Telegram (4096 знаков). Сократите шаблон или тему.';
const WRONG_FILE_ID_MESSAGE =
  'Telegram не нашёл видео по file_id — пришлите запись боту заново.';
const CAPTION_TOO_LONG_MESSAGE =
  'Подпись к видео длиннее 1024 знаков. Сократите текст занятия.';

// Английские подстроки `description` Bot API → готовый текст для учителя.
// Проверяются раньше кода ответа: «bot was kicked»/«bot was blocked by the
// user» и «chat not found» приходят с разными кодами в разных версиях API,
// а конкретная причина важнее кода.
const KNOWN_DESCRIPTIONS: ReadonlyArray<{
  readonly match: string;
  readonly message: string;
}> = [
  { match: 'message is too long', message: MESSAGE_TOO_LONG_MESSAGE },
  { match: 'wrong file identifier', message: WRONG_FILE_ID_MESSAGE },
  { match: 'caption is too long', message: CAPTION_TOO_LONG_MESSAGE },
  { match: 'chat not found', message: CHAT_NOT_FOUND_MESSAGE },
  { match: 'bot was blocked by the user', message: NOT_ADMIN_MESSAGE },
  { match: 'bot was kicked', message: NOT_ADMIN_MESSAGE },
];

// 429/5xx — временная перегрузка или сбой на стороне Telegram, повтор
// планировщика может сработать; 400/403 — бот не админ канала, чат не
// найден и т.п., без смены конфигурации повтор не поможет.
export function isRetryableTelegramCode(code: number): boolean {
  return code === 429 || code >= 500;
}

/** `description` — сырой текст Telegram после `scrubChannelSecrets`
 * (вызывающий уже скрабит его так же, как для лога, SECURITY §5). */
export function messageForTelegramError(code: number, description: string): string {
  const known = KNOWN_DESCRIPTIONS.find(({ match }) => description.includes(match));
  if (known) return known.message;
  if (code === 403) return NOT_ADMIN_MESSAGE;
  if (code === 400) return `Telegram отклонил сообщение: ${description}`;
  if (isRetryableTelegramCode(code)) return TEMPORARY_MESSAGE;
  return `Telegram отклонил сообщение (код ${code}). Проверьте настройки бота.`;
}

/** 429 несёт минимальное время ожидания в секундах — только он, остальные
 * коды `parameters.retry_after` не отдают (M2). */
export function retryAfterSecFrom(err: TelegramApiErrorLike): number | undefined {
  return err.code === 429 ? err.parameters?.retry_after : undefined;
}
