// Шаблоны постов по умолчанию (docs/PLAN.md §1, §6): слово в слово повторяют
// нынешние посты канала. Утренний анонс из PLAN §1 не подтверждён учителем
// (см. PLAN §10) и в defaults не входит.

import type { BroadcastKind } from './domain';

/**
 * Вид шаблона — это вид рассылки (`BroadcastKind`), кроме `manual`: разовую
 * рассылку учитель пишет каждый раз сам, шаблона по умолчанию для неё нет.
 * Общий список имён с `BROADCAST_KINDS` (shared/src/domain.ts): иначе
 * планировщику пришлось бы держать таблицу соответствия трёх разных имён
 * одной сущности.
 */
export const TEMPLATE_KINDS = [
  'lesson_link',
  'recording',
] as const satisfies readonly BroadcastKind[];

export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

export const DEFAULT_TEMPLATES: Record<TemplateKind, string> = {
  lesson_link:
    '[{группа}\n]Через {минут} минут {название}[: {тема}]. Запись будет выложена для всех, кто не может участвовать.\n{ссылка}[ пароль {пароль}]',
  // «— {ссылка}» — необязательный фрагмент: запись бывает видеофайлом в
  // канале по file_id без ссылки (PLAN.md §4 `lessons.recordings`), и без
  // этого правила пост заканчивался бы висячим тире.
  recording:
    '{название}[: {тема}][. Занятие {длительность}][, ведёт {ведущий}][ — {ссылка}]',
};
