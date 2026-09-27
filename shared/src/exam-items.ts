// Вопрос экзамена: DTO и константы API вопроса (`/exam-items`, слой 4.2).
// Отдельным файлом, потому что exams.ts упёрся в лимит размера (CLAUDE.md
// «Храповики») — не потому что так красивее: форма экзамена (блоки, лимиты
// формы) осталась в exams.ts, здесь только вопрос и его варианты ответа.

// DTO и константы API вопросов экзамена (`/exam-items`, слой 4.2,
// docs/PLAN.md §11, docs/adr/0022-exam-model-item-bank-and-snapshot.md).
// Общий контракт api и web (CLAUDE.md, раздел «Слои»): DTO в api объявляется
// как `implements` этих типов, расхождение ловит tsc. Веб-экран — следующий
// слой, здесь только контракт бэкенда.

export const EXAM_ITEM_KINDS = ['text', 'single', 'multiple', 'video'] as const;
export type ExamItemKind = (typeof EXAM_ITEM_KINDS)[number];

export const EXAM_ITEM_STATUSES = ['draft', 'published', 'archived'] as const;
export type ExamItemStatus = (typeof EXAM_ITEM_STATUSES)[number];

/** `imageId` — картинка варианта (ADR-0035, `GET /exam-images/:id`);
 * `videoId`/`videoUrl` — видео варианта тем же смыслом (ADR-0133,
 * `GET /exam-videos/:id`, файл в R2, либо https-ссылка без R2): вариант
 * может быть текстом, картинкой или видео, но не двумя видами медиа разом —
 * не более одного из `imageId`/`videoId`/`videoUrl` (OPTION_ONE_MEDIA_MESSAGE
 * ниже). `text` при медиа без подписи — пустая строка, не отсутствие поля:
 * форма и снимок попытки всегда видят строку. */
export interface ExamItemOptionDto {
  id: string;
  text: string;
  correct: boolean;
  imageId?: string;
  videoId?: string;
  videoUrl?: string;
}

/** `id` есть у существующего варианта (сервис сохраняет его как есть при
 * правке — см. `mapOptions`, `exam-item-options.ts`); без `id` — новый
 * вариант, сервис создаёт `id` сам. Тот же приём, что у `ScheduleRuleInput`
 * (shared/src/classes.ts) — с `id` или без него, правка сохраняет или
 * заводит идентификатор одинаково. `text` необязателен: у варианта-медиа
 * подписи может не быть, но хотя бы одно из трёх — текст, `imageId` или
 * видео — сервис требует (OPTION_CONTENT_REQUIRED_MESSAGE ниже). */
export interface ExamItemOptionInput {
  id?: string;
  text?: string;
  correct?: boolean;
  imageId?: string;
  videoId?: string;
  videoUrl?: string;
}

/** Прошлая редакция опубликованного вопроса — правка содержательного поля
 * (prompt/options) кладёт сюда снимок ДО правки, а `version`
 * поднимается на 1 (ADR-0022: сданные работы ссылаются на конкретную
 * редакцию, правка вопроса не должна менять смысл уже сданного). Старые
 * записи истории (до ADR-0128) могут хранить и `hint`/`criteria` внутри
 * зашифрованного JSON — маппер их не читает, историю ради этого не
 * переписываем. */
interface ExamItemVersionDto {
  version: number;
  prompt: string;
  videoId?: string;
  videoUrl?: string;
  options: ExamItemOptionDto[];
  replacedAt: string; // ISO UTC
}

/** Видео к формулировке вопроса (ADR-0133) — например, «что не так в этом
 * движении» у текстового вопроса. Не более одного из `videoId`/`videoUrl`:
 * файл в R2 или https-ссылка, а не оба разом. */
export interface ExamItemDto {
  id: string;
  kind: ExamItemKind;
  prompt: string;
  videoId?: string;
  videoUrl?: string;
  options: ExamItemOptionDto[];
  status: ExamItemStatus;
  version: number;
  history: ExamItemVersionDto[];
  authorId?: string;
  createdAt: string;
  updatedAt: string; // ISO UTC с Z
  deletedAt?: string; // ISO UTC; удалён из списка, но стоит в экзаменах (ADR-0140)
}

export interface CreateExamItemInput {
  kind: ExamItemKind;
  prompt: string;
  videoId?: string;
  videoUrl?: string;
  options?: ExamItemOptionInput[];
  status?: ExamItemStatus; // не прислали — сразу `published` (ADR-0033)
}

/**
 * PATCH: `kind` сюда не входит — смена типа вопроса значит завести новый
 * (правило CLAUDE.md/ТЗ 4.2, п.1). `videoId`/`videoUrl` — `null` явно
 * снимает видео вопроса, оба входят в NULLABLE_EXAM_ITEM_FIELDS ниже.
 */
export interface UpdateExamItemInput {
  prompt?: string;
  videoId?: string | null;
  videoUrl?: string | null;
  options?: ExamItemOptionInput[];
  status?: ExamItemStatus;
}

/** Единственные поля UpdateExamItemInput, где `null` — не ошибка формы, а
 * явный сброс (тот же приём, что NULLABLE_CLASS_FIELDS, shared/src/classes.ts)
 * — источник правды и для DTO (`@IsOptional()` вместо `OptionalNotNull()`), и
 * для `splitUpdate` в ExamItemsService.update. */
export const NULLABLE_EXAM_ITEM_FIELDS = ['videoId', 'videoUrl'] as const;

export interface ListExamItemsQuery {
  status?: ExamItemStatus;
  kind?: ExamItemKind;
  limit?: number;
  includeDeleted?: boolean; // с удалёнными — редактору экзамена (ADR-0140)
}

export const EXAM_ITEM_LIMITS = {
  prompt: 2000,
  optionText: 300,
  optionsMax: 10,
  optionsMin: 2,
  /** Как EXAM_VIDEO_LIMITS.videoUrl (exam-videos.ts, ADR-0133); не импортом —
   * у вопросов нет зависимости от домена видео ради одного числа. */
  videoUrl: 500,
} as const;

export const EXAM_ITEM_NOT_FOUND_MESSAGE = 'Вопрос не найден. Обновите список.';

// Правило вариантов с медиа (ADR-0035, дополнено ADR-0133): пустой вариант —
// ни текста, ни картинки, ни видео — не сохраняется; проверяет сервис
// (assertOptionsForKind), форма повторяет проверку до отправки. Название
// переименовано с OPTION_TEXT_OR_IMAGE_MESSAGE — правило теперь про три вида
// содержимого, не про два.
export const OPTION_CONTENT_REQUIRED_MESSAGE =
  'У варианта ответа нужен текст, картинка или видео. Впишите текст или добавьте медиа.';

// У варианта — не больше одного вида медиа разом: картинка или видео, не оба
// (ADR-0133). Без этого правила порядок «что показывать первым» решался бы
// молча где-то на экране, а не было бы явным отказом здесь.
export const OPTION_ONE_MEDIA_MESSAGE =
  'У варианта может быть только одно медиа — картинка или видео, не оба сразу. Уберите лишнее.';

// Видео вопроса — файл в R2 или ссылка, не оба разом (ADR-0133) — тем же
// правилом, что у варианта (OPTION_ONE_MEDIA_MESSAGE), но текст называет
// вопрос, не вариант.
export const ITEM_ONE_VIDEO_SOURCE_MESSAGE =
  'У вопроса может быть только один источник видео — файл или ссылка, не оба сразу. Уберите лишнее.';
