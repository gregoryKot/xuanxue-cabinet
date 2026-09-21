// Библиотека материалов школы — слой 3.1 (docs/PLAN.md §14, ADR-0047).
// Данные школы (ADR-0010), не ученика: общий список для всего штата, как
// заготовки комментариев (grading-comment-preset.ts) или шаблоны рассылок.
// `classIds[]` — рубрикация и фильтр, не доступ (ADR-0047): пустой массив
// значит «материал всей школы», привязка не меняет, кто его видит. Файл
// материала (слой 3.10, ADR-0057) — соседний material-files.ts. Доступа по
// оплате нет (ADR-0096, отменяет ADR-0048): материалы открыты тому, кто в
// школе, кроме служебных — видны только штату (ADR-0058).

import type { MaterialFileDto } from './material-files';

/** Закрытый список видов — новый вид требует ADR-0047-подобного решения, не
 * правки массива (ADR-0047). */
export const MATERIAL_KINDS = ['book', 'article', 'video', 'document'] as const;
export type MaterialKind = (typeof MATERIAL_KINDS)[number];

/** Подписи видов для интерфейса и бота — один источник (CLAUDE.md «Без
 * магических чисел и строк»): второго места с названиями видов в коде быть
 * не должно (слой 3.2, docs/PLAN.md §14). */
export const MATERIAL_KIND_LABELS: Record<MaterialKind, string> = {
  book: 'Книга',
  article: 'Статья',
  video: 'Видео',
  document: 'Документ',
};

/**
 * Кто видит материал (ADR-0058) — одно поле, один запрос, одна функция
 * (`isMaterialHiddenFromStudent`, api/src/materials/material-access.ts), не
 * второй механизм рядом с ролями (ADR-0010): `all` видят все ученики,
 * `staff` — только штат (`isStaffRole`), ученику такой материал не
 * приходит вовсе — ни материалом, ни строкой в лимите списка. Значения
 * `paid` и рубильника школы больше нет (ADR-0096, отменяет ADR-0048): оплат
 * в кабинете не было ни дня, и это значение не решало ничего, кроме «пока
 * рано».
 */
export const MATERIAL_ACCESS_LEVELS = ['all', 'staff'] as const;
export type MaterialAccess = (typeof MATERIAL_ACCESS_LEVELS)[number];

/** Подписи уровней доступа для интерфейса — один источник (по образцу
 * MATERIAL_KIND_LABELS): те же слова в переключателе формы
 * (MaterialAccessField.tsx) и в пилюле строки списка (MaterialCard.tsx). */
export const MATERIAL_ACCESS_LABELS: Record<MaterialAccess, string> = {
  all: 'Все ученики',
  staff: 'Только преподаватели',
};

/** Материал глазами штата школы — видит всё, включая служебные поля. */
export interface MaterialDto {
  id: string;
  title: string;
  url: string;
  kind: MaterialKind;
  classIds: string[];
  /** Даты занятий, к которым привязан материал (ADR-0056) — рядом с
   * `classIds`, тот же смысл рубрикации и фильтра, не доступа. */
  lessonIds: string[];
  access: MaterialAccess;
  /** Рубрикация свободным текстом (ADR-0058) — фильтр списка, не доступ:
   * кто видит материал, решает `access`. Нормализуется при записи
   * (`normalizeTags`, shared/src/tags.ts). */
  tags: string[];
  /** Файл в хранилище (ADR-0057), если он загружен. Скачивается отдельным
   * запросом по своему адресу — байты в JSON не ходят. */
  file?: MaterialFileDto;
  createdBy: string;
  createdAt: string; // ISO UTC с Z
  updatedAt: string; // ISO UTC с Z
}

export interface CreateMaterialInput {
  title: string;
  url: string;
  kind: MaterialKind;
  classIds?: string[];
  lessonIds?: string[];
  access?: MaterialAccess;
  tags?: string[];
}

export interface UpdateMaterialInput {
  title?: string;
  url?: string;
  kind?: MaterialKind;
  classIds?: string[];
  lessonIds?: string[];
  access?: MaterialAccess;
  tags?: string[];
}

export interface ListMaterialsQuery {
  classId?: string;
  /** Дата занятия (ADR-0056) — сочетается с `classId` через «И», не «ИЛИ»
   * (materials.queries.ts, buildMaterialsFilter). */
  lessonId?: string;
  kind?: MaterialKind;
  /** Точное совпадение тега — рубрикация, серверный фильтр (ADR-0058). */
  tag?: string;
  limit?: number;
}

/** Библиотека глазами ученика (GET /api/me/materials) — ни `createdBy`, ни
 * `access`, ни служебных дат: не его данные, ему нужно только то, что можно
 * открыть (CLAUDE.md «API»). `url` есть у любого материала в ответе:
 * служебный материал (`access: 'staff'`) ученику не приходит вовсе
 * (ADR-0058), закрывать отдельным полем нечего — признака `locked` в
 * контракте больше нет (ADR-0096, отменяет ADR-0048): поле, что не может
 * стать `true`, только врало бы фронту. */
export interface MyMaterialDto {
  id: string;
  title: string;
  kind: MaterialKind;
  /** Названия занятий, к которым материал привязан, а не их id: `GET /classes`
   * закрыт ролью (ClassesController), и подписать id ученику было бы нечем —
   * рубрикация из ADR-0047 иначе не доезжает до того, ради кого затевалась.
   * Пустой массив — материал всей школы. */
  classTitles: string[];
  /** Теги видит и ученик (ADR-0058) — рубрикация нужна прежде всего тому,
   * кто ищет своё; прятать её от ученика значило бы оставить рубрикацию
   * одному учителю. */
  tags: string[];
  url: string;
  /** Файл в хранилище (ADR-0057), если он загружен — тем же смыслом, что
   * `MaterialDto.file`. */
  file?: MaterialFileDto;
}

export interface ListMyMaterialsQuery {
  limit?: number;
}

export const MATERIAL_LIMITS = { title: 200, url: 500 } as const;

/** Максимум занятий, к которым можно привязать один материал — не про
 * доступ (ADR-0047), просто разумный потолок формы. */
export const MATERIAL_MAX_CLASS_IDS = 20;

/** Максимум дат занятий у одного материала (ADR-0056) — тот же потолок
 * формы, что и у `MATERIAL_MAX_CLASS_IDS`, своя константа: привязки разные
 * и растут независимо. */
export const MATERIAL_MAX_LESSON_IDS = 20;

// VOICE.md: конкретика вместо «произошла ошибка» — что случилось и что делать.
export const MATERIAL_NOT_FOUND_MESSAGE =
  'Материал уже удалён. Обновите список материалов.';

/** Лимит списка штата (`GET /api/materials`, docs/PLAN.md §14) — то же
 * значение по умолчанию, что у LIST_LIMIT_DEFAULT (shared/src/classes.ts),
 * своя константа, чтобы домен читался сам по себе, максимум — общий
 * LIST_LIMIT_MAX (`@ListLimit()` без аргумента). */
export const MATERIALS_LIMIT_DEFAULT = 50;

/** Лимит библиотеки ученика (`GET /api/me/materials`) — своя пара, не
 * MATERIALS_LIMIT_DEFAULT/LIST_LIMIT_MAX: экрану ученика короткий список,
 * тот же приём, что у MY_LESSONS_LIMIT_DEFAULT/MAX (shared/src/lessons.ts). */
export const MY_MATERIALS_LIMIT_DEFAULT = 50;
export const MY_MATERIALS_LIMIT_MAX = 100;
