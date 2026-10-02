// Видео-ответ ученика — файл, загруженный частями через инстанс в R2
// multipart (ADR-0137, уточняет ADR-0023/ADR-0084/ADR-0133). В отличие от
// видео вопроса (exam-videos.ts, референс учителя, до 50 МБ одним телом),
// здесь форма с телефона — до 1 ГБ, поэтому файл режется на части по 8 МиБ и
// шлётся по одной: `POST /attempts/:id/answer-video` заводит загрузку,
// `PUT /answer-videos/:id/parts/:n` принимает часть, `POST
// /answer-videos/:id/complete` завершает её в R2 и превращает в
// `media_assets` (`kind: 'file'`).

const BYTES_IN_MB = 1024 * 1024;
const BYTES_IN_GB = 1024 * BYTES_IN_MB;

export const ANSWER_VIDEO_LIMITS = {
  /** Пять-восемь минут формы с телефона в любом кодеке — «сократите
   * запись» не говорим (ADR-0137, в отличие от 50 МБ референса учителя). */
  maxBytes: BYTES_IN_GB,
  /** Часть режет браузер — 8 МиБ в памяти инстанса на одну часть, а не на
   * файл целиком (ADR-0137). */
  partBytes: 8 * BYTES_IN_MB,
  /** Отпечаток файла — `размер:SHA-256` первого и последнего МиБ, без имени и
   * без даты (ADR-0137, ADR-0165, F18). Длина — до 10 цифр размера, `:` и 64
   * знака хэша, 100 с запасом. */
  fingerprint: 100,
} as const;

/** Срок хранения видео-ответа (ADR-0137) — как у снимков оплат (ADR-0050):
 * одна дата «отслужило» (проверили), другая «забыто» (так и не проверили). */
export const ANSWER_VIDEO_RETENTION = {
  afterGradedDays: 90,
  ungradedDays: 365,
} as const;

export interface StartAnswerVideoInput {
  itemId: string;
  /** Заявленный размер всего файла — по нему считается число частей
   * (`Math.ceil(sizeBytes / partBytes)`) и сверяется размер каждой. */
  sizeBytes: number;
  fingerprint: string;
}

export interface AnswerVideoUploadDto {
  id: string;
  partBytes: number;
  partCount: number;
  /** Номера частей, которые уже приняты — по ним браузер продолжает с
   * первой недостающей, не начинает заново (ADR-0137). */
  receivedParts: number[];
}

/** Число видео-ответов и их суммарный объём — число раздела «Экзамены»
 * (CLAUDE.md «Продуктовая фича = число в своём разделе»), тем же приёмом,
 * что ExamVideoStatsDto. Считаются только `status: 'ready'` — недогруженное
 * никто ещё не смотрел. */
export interface AnswerVideoStatsDto {
  count: number;
  totalBytes: number;
}

// VOICE: что случилось и что сделать дальше, на «вы» — переиспользуем
// сообщения exam-videos.ts/exam-media.ts там, где смысл совпадает буквально
// (комментарии у каждого — почему).

// Смысл как у EXAM_VIDEO_TOO_LARGE_MESSAGE, но другой потолок и другой
// совет: без R2 путь ссылкой/ботом всё ещё открыт.
export const ANSWER_VIDEO_TOO_LARGE_MESSAGE =
  `Видео больше ${ANSWER_VIDEO_LIMITS.maxBytes / BYTES_IN_GB} ГБ. ` +
  'Пришлите его ссылкой или через бота в Telegram.';

// Часть не совпала по размеру или номеру — телефон мог досняться в фоне,
// пока грузилась предыдущая часть; браузер обязан выбрать файл заново.
export const ANSWER_VIDEO_PART_INVALID_MESSAGE =
  'Файл, кажется, изменился во время загрузки. Обновите страницу и выберите файл ещё раз.';

// Не все части дошли до завершения — тот же случай, что EXAM_VIDEO_EMPTY_MESSAGE,
// но при `complete`, не при самой части.
export const ANSWER_VIDEO_PARTS_MISSING_MESSAGE =
  'Загрузка ещё не закончена — дошли не все части файла. Подождите и попробуйте снова.';

// Один текст на чужую и на несуществующую загрузку (SECURITY §3), тот же
// приём, что EXAM_VIDEO_NOT_FOUND_MESSAGE.
export const ANSWER_VIDEO_NOT_FOUND_MESSAGE =
  'Не нашли эту загрузку. Обновите страницу и выберите файл ещё раз.';

// Часть с номером больше 1 пришла раньше первой — первая часть открывает
// multipart-загрузку в R2 (ADR-0137), без неё принимать нечего.
export const ANSWER_VIDEO_FIRST_PART_REQUIRED_MESSAGE =
  'Сначала должна дойти первая часть файла. Обновите страницу и начните заново.';
