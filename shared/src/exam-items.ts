// DTO и константы API вопросов экзамена (`/exam-items`, слой 4.2, docs/PLAN.md
// §11, docs/adr/0022-exam-model-item-bank-and-snapshot.md). Отдельным файлом,
// потому что exams.ts упёрся в лимит размера (CLAUDE.md «Храповики») — форма
// экзамена осталась там, здесь только вопрос и его варианты ответа. Общий
// контракт api и web: DTO в api объявляется как `implements` этих типов,
// расхождение ловит tsc.

export const EXAM_ITEM_KINDS = ['text', 'single', 'multiple', 'video'] as const;
export type ExamItemKind = (typeof EXAM_ITEM_KINDS)[number];

export const EXAM_ITEM_STATUSES = ['draft', 'published', 'archived'] as const;
export type ExamItemStatus = (typeof EXAM_ITEM_STATUSES)[number];

/** `imageId` — картинка варианта (ADR-0035, `GET /exam-images/:id`);
 * `videoId`/`videoUrl` — видео варианта тем же смыслом (ADR-0133): не более
 * одного медиа разом (OPTION_ONE_MEDIA_MESSAGE ниже). `text` при медиа без
 * подписи — пустая строка, не отсутствие поля. */
export interface ExamItemOptionDto {
  id: string;
  text: string;
  correct: boolean;
  imageId?: string;
  videoId?: string;
  videoUrl?: string;
}

/** `id` есть у существующего варианта (сохраняется как есть, `mapOptions`);
 * без `id` — новый, сервис заводит его сам. `text` необязателен: у
 * варианта-медиа подписи может не быть, но хотя бы одно из трёх — текст,
 * `imageId` или видео — сервис требует (OPTION_CONTENT_REQUIRED_MESSAGE). */
export interface ExamItemOptionInput {
  id?: string;
  text?: string;
  correct?: boolean;
  imageId?: string;
  videoId?: string;
  videoUrl?: string;
}

/** Прошлая редакция опубликованного вопроса — правка содержательного поля
 * кладёт сюда снимок ДО правки, `version` поднимается на 1 (ADR-0022: сданные
 * работы ссылаются на конкретную редакцию). Старые записи (до ADR-0128) могут
 * хранить и `hint`/`criteria` внутри — маппер их не читает. */
interface ExamItemVersionDto {
  version: number;
  prompt: string;
  videoId?: string;
  videoUrl?: string;
  options: ExamItemOptionDto[];
  /** Стояло ли требование объяснения в этой редакции (ADR-0146) — история
   * хранит именно то, что видел сдающий, а не сегодняшнюю настройку вопроса. */
  askReason?: boolean;
  replacedAt: string; // ISO UTC
}

/** Видео к формулировке вопроса (ADR-0133) — не более одного из
 * `videoId`/`videoUrl`: файл в R2 или https-ссылка, а не оба разом. */
export interface ExamItemDto {
  id: string;
  kind: ExamItemKind;
  prompt: string;
  videoId?: string;
  videoUrl?: string;
  options: ExamItemOptionDto[];
  /** Учитель просит ученика объяснить выбранный вариант (ADR-0146) — только
   * у single/multiple, проверяет сервис (assertReasonAllowedForKind). Ключа
   * нет, если выключено — тем же приёмом, что deletedAt ниже. */
  askReason?: boolean;
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
  askReason?: boolean;
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
  askReason?: boolean;
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

// ADR-0146: объяснение просит подтвердить выбор варианта — у вопроса без
// вариантов (текст, видео) просить нечего объяснять.
export const ASK_REASON_KIND_MESSAGE =
  'Просить объяснение можно только у вопроса с выбором варианта. Уберите этот флаг или смените тип вопроса.';
