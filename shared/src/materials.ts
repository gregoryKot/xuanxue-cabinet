// Библиотека материалов школы — слой 3.1 (docs/PLAN.md §14, ADR-0047,
// ADR-0048). Данные школы (ADR-0010), не ученика: общий список для всего
// штата, как заготовки комментариев (grading-comment-preset.ts) или шаблоны
// рассылок. `classIds[]` — рубрикация и фильтр, не доступ (ADR-0047): пустой
// массив значит «материал всей школы», привязка не меняет, кто его видит.

/** Закрытый список видов — новый вид требует ADR-0047-подобного решения, не
 * правки массива (ADR-0047). */
export const MATERIAL_KINDS = ['book', 'article', 'video', 'document'] as const;
export type MaterialKind = (typeof MATERIAL_KINDS)[number];

// Подписи видов для интерфейса и бота («Книга», «Статья», «Видео»,
// «Документ») — в этом PR (слой 3.1, только API) их некому импортировать:
// добавит слой 3.2 вместе с экраном `/materials`, а не сейчас про запас,
// иначе check-shared-exports.mjs роняет CI на неиспользуемом имени барабана.

/** Отметка «после оплаты» у материала (ADR-0048) — школьный рубильник
 * `settings.materialsPaidAccess` решает, действует ли она сейчас. */
export const MATERIAL_ACCESS_LEVELS = ['all', 'paid'] as const;
export type MaterialAccess = (typeof MATERIAL_ACCESS_LEVELS)[number];

/** Материал глазами штата школы — видит всё, включая служебные поля. */
export interface MaterialDto {
  id: string;
  title: string;
  url: string;
  kind: MaterialKind;
  classIds: string[];
  access: MaterialAccess;
  createdBy: string;
  createdAt: string; // ISO UTC с Z
  updatedAt: string; // ISO UTC с Z
}

export interface CreateMaterialInput {
  title: string;
  url: string;
  kind: MaterialKind;
  classIds?: string[];
  access?: MaterialAccess;
}

export interface UpdateMaterialInput {
  title?: string;
  url?: string;
  kind?: MaterialKind;
  classIds?: string[];
  access?: MaterialAccess;
}

export interface ListMaterialsQuery {
  classId?: string;
  kind?: MaterialKind;
  limit?: number;
}

/** Библиотека глазами ученика (GET /api/me/materials) — ни `createdBy`, ни
 * `access`, ни служебных дат: это не его данные, ему нужно только то, что
 * можно открыть (CLAUDE.md «API»). В этом PR (слой 3.1) `url` есть у любого
 * материала и `locked` не выставляется никогда — рубильник платного доступа
 * (ADR-0048) появляется слоем 3.4: тогда закрытый материал будет приходить
 * без `url` и с `locked: true`. Поля объявлены заранее, чтобы фронт слоя 3.2
 * не переделывал тип второй раз. */
export interface MyMaterialDto {
  id: string;
  title: string;
  kind: MaterialKind;
  classIds: string[];
  url?: string;
  locked?: true;
}

export interface ListMyMaterialsQuery {
  limit?: number;
}

export const MATERIAL_LIMITS = { title: 200, url: 500 } as const;

/** Максимум занятий, к которым можно привязать один материал — не про
 * доступ (ADR-0047), просто разумный потолок формы. */
export const MATERIAL_MAX_CLASS_IDS = 20;

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
