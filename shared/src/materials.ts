// Библиотека материалов школы — слой 3.1 (docs/PLAN.md §14, ADR-0047).
// Данные школы (ADR-0010), не ученика: общий список для всего штата, как
// заготовки комментариев (grading-comment-preset.ts). `classIds[]` —
// рубрикация и фильтр, не доступ (ADR-0047): пустой массив значит «материал
// всей школы», привязка не меняет, кто его видит. Файл материала (слой 3.10,
// ADR-0057) — соседний material-files.ts. Доступа по оплате нет (ADR-0096,
// отменяет ADR-0048): материалы открыты тому, кто в школе, кроме служебных —
// они видны только штату (ADR-0058).
//
// Ссылка необязательна, если у материала есть файл (ADR-0133, уточняет
// ADR-0057 и ADR-0047): учитель с одним PDF больше не придумывает адрес.
// Открыть есть чем всегда — ученику едет только материал со ссылкой или с
// файлом (`STUDENT_OPENABLE_FILTER`, MaterialsService.listForStudent).

import type { MaterialFileDto } from './material-files';

/** Закрытый список видов — новый вид требует решения, не правки массива
 * (ADR-0047). */
export const MATERIAL_KINDS = ['book', 'article', 'video', 'document'] as const;
export type MaterialKind = (typeof MATERIAL_KINDS)[number];

/** Подписи видов — один источник (CLAUDE.md «Без магических строк»). */
export const MATERIAL_KIND_LABELS: Record<MaterialKind, string> = {
  book: 'Книга',
  article: 'Статья',
  video: 'Видео',
  document: 'Документ',
};

/** Кто видит материал (ADR-0058) — одно поле, один запрос, одна функция
 * (`isMaterialHiddenFromStudent`, api/src/materials/material-access.ts), не
 * второй механизм рядом с ролями (ADR-0010): `all` видят все ученики,
 * `staff` — только штат (`isStaffRole`), ученику такой материал не приходит
 * вовсе — ни материалом, ни строкой в лимите списка. Значения `paid` и
 * рубильника школы больше нет (ADR-0096, отменяет ADR-0048). */
export const MATERIAL_ACCESS_LEVELS = ['all', 'staff'] as const;
export type MaterialAccess = (typeof MATERIAL_ACCESS_LEVELS)[number];

/** Подписи уровней доступа — один источник (по образцу MATERIAL_KIND_LABELS):
 * те же слова в переключателе формы и в пилюле строки списка. */
export const MATERIAL_ACCESS_LABELS: Record<MaterialAccess, string> = {
  all: 'Все ученики',
  staff: 'Только преподаватели',
};

/** Материал глазами штата школы — всё, включая служебные поля. */
export interface MaterialDto {
  id: string;
  title: string;
  /** Нет ключа — ссылки нет вовсе, открывают файлом (ADR-0133). */
  url?: string;
  kind: MaterialKind;
  classIds: string[];
  /** Даты занятий (ADR-0056) — тот же смысл, что у `classIds`. */
  lessonIds: string[];
  access: MaterialAccess;
  /** Рубрикация свободным текстом (ADR-0058) — фильтр списка, не доступ: кто
   * видит материал, решает `access`. Нормализуется при записи. */
  tags: string[];
  /** Файл в хранилище (ADR-0057): скачивается отдельным запросом, байты в
   * JSON не ходят. */
  file?: MaterialFileDto;
  createdBy: string;
  createdAt: string; // ISO UTC с Z
  updatedAt: string; // ISO UTC с Z
}

export interface CreateMaterialInput {
  title: string;
  /** Необязательна (ADR-0133): материал заводят и с одним файлом; пустую
   * строку не кладут — поля просто нет. */
  url?: string;
  kind: MaterialKind;
  classIds?: string[];
  lessonIds?: string[];
  access?: MaterialAccess;
  tags?: string[];
}

export interface UpdateMaterialInput {
  title?: string;
  /** `null` — «убрать ссылку» (ADR-0133), приёмом nullable-полей занятия, а
   * не пустой строкой: та доехала бы до базы значением и в ответе выглядела
   * бы ссылкой, которой нет. Поля нет — «не трогать». */
  url?: string | null;
  kind?: MaterialKind;
  classIds?: string[];
  lessonIds?: string[];
  access?: MaterialAccess;
  tags?: string[];
}

/** Поля PATCH, где `null` значит «сбросить» (`splitUpdate`, как
 * NULLABLE_LESSON_FIELDS у занятия). Ссылка единственная: название и вид
 * есть всегда, привязки и теги сбрасываются пустым массивом. */
export const NULLABLE_MATERIAL_FIELDS = ['url'] as const;

export interface ListMaterialsQuery {
  classId?: string;
  /** Дата занятия (ADR-0056) — сочетается с `classId` через «И», не «ИЛИ». */
  lessonId?: string;
  kind?: MaterialKind;
  /** Точное совпадение тега — рубрикация, серверный фильтр (ADR-0058). */
  tag?: string;
  limit?: number;
}

/** Библиотека глазами ученика (GET /api/me/materials) — ни `createdBy`, ни
 * `access`, ни служебных дат: не его данные, ему нужно только то, что можно
 * открыть (CLAUDE.md «API»). Служебный материал ему не приходит вовсе
 * (ADR-0058), признака `locked` в контракте нет (ADR-0096). Открыть есть чем
 * всегда: ссылка, файл или и то и другое (ADR-0133) — материал без того и
 * другого отсекает запрос (listForStudent), а не карточка. */
export interface MyMaterialDto {
  id: string;
  title: string;
  kind: MaterialKind;
  /** Названия занятий, а не их id: `GET /classes` закрыт ролью, и подписать
   * id ученику было бы нечем — рубрикация ADR-0047 иначе не доезжает до
   * того, ради кого затевалась. Пустой массив — материал всей школы. */
  classTitles: string[];
  /** Теги видит и ученик (ADR-0058) — рубрикация нужна прежде всего тому,
   * кто ищет своё, прятать её от него незачем. */
  tags: string[];
  /** Ссылка, если она есть (ADR-0133) — иначе у материала есть файл. */
  url?: string;
  /** Файл в хранилище (ADR-0057) — тем же смыслом, что `MaterialDto.file`. */
  file?: MaterialFileDto;
}

export interface ListMyMaterialsQuery {
  limit?: number;
}

export const MATERIAL_LIMITS = { title: 200, url: 500 } as const;

/** Максимум занятий у одного материала — не про доступ (ADR-0047), просто
 * разумный потолок формы. */
export const MATERIAL_MAX_CLASS_IDS = 20;

/** Максимум дат занятий (ADR-0056) — тот же потолок формы, что у
 * `MATERIAL_MAX_CLASS_IDS`, своя константа: привязки растут независимо. */
export const MATERIAL_MAX_LESSON_IDS = 20;

// VOICE.md: конкретика вместо «произошла ошибка» — что случилось и что делать.
export const MATERIAL_NOT_FOUND_MESSAGE =
  'Материал уже удалён. Обновите список материалов.';

/** Лимит списка штата (`GET /api/materials`) — то же значение, что у
 * LIST_LIMIT_DEFAULT (shared/src/classes.ts), своя константа, чтобы домен
 * читался сам по себе; максимум — общий LIST_LIMIT_MAX. */
export const MATERIALS_LIMIT_DEFAULT = 50;

/** Лимит библиотеки ученика (`GET /api/me/materials`) — своя пара: экрану
 * ученика короткий список, приёмом MY_LESSONS_LIMIT_DEFAULT/MAX. */
export const MY_MATERIALS_LIMIT_DEFAULT = 50;
export const MY_MATERIALS_LIMIT_MAX = 100;
