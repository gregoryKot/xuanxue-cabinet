// Группы учеников школы (ADR-0193) — общий список школы: «Начинающие»,
// «Средние», «Старшие» и всё, что школа заведёт сама. Занятие входит в одну
// или несколько групп (`ClassDto.groupIds`); подпись группы в посте и на
// экранах (`ClassDto.groupLabel`) сервер собирает из названий сам — клиенты её
// больше не пишут.

export interface GroupDto {
  id: string;
  name: string;
  /** Сколько занятий входит в группу: пока их больше нуля, группу не удалить. */
  classCount: number;
  createdAt: string;
  updatedAt: string; // ISO UTC с Z
}

/** Тело POST и PATCH /groups — у группы одно редактируемое поле. */
export interface GroupInput {
  name: string;
}

export const GROUP_LIMITS = { name: 60 } as const;

/** Группы, с которых школа начинает (миграция 0027, порядок — как их называет
 * школа: от новичков к старшим). */
export const DEFAULT_GROUP_NAMES = ['Начинающие', 'Средние', 'Старшие'] as const;

/** Группы нет — общий текст сервиса групп и проверки `groupIds` у занятия. */
export const GROUP_NOT_FOUND_MESSAGE = 'Такой группы нет. Обновите список.';

const GROUP_LABEL_SEPARATOR = ', ';

/** Ключ уникальности названия: «Средние» и « средние » — одна группа. */
export function groupNameKey(name: string): string {
  return name.trim().toLowerCase();
}

/** Подпись группы занятия: названия через запятую в порядке создания групп —
 * ровно то, что идёт первой строкой поста (`{группа}`). */
export function joinGroupNames(names: readonly string[]): string {
  return names.join(GROUP_LABEL_SEPARATOR);
}
