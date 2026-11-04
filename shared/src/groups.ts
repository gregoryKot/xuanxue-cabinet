// Группы учеников школы (ADR-0193) — общий список школы: «Начинающие»,
// «Средние», «Старшие» и всё, что школа заведёт сама. Группа — единственный
// рычаг рассылки (ADR-0195): у занятия одна группа (`ClassDto.groupId`), у
// канала одна (`ChannelDto.groupId`), ссылка уходит в каналы той же группы.
// Подпись группы в посте и на экранах (`ClassDto.groupLabel`) сервер берёт из
// названия сам — клиенты её не пишут.

export interface GroupDto {
  id: string;
  name: string;
  /** Сколько занятий отнесено к группе: пока их больше нуля, группу не удалить. */
  classCount: number;
  /** Сколько каналов получает занятия группы: пока их больше нуля, группу не удалить. */
  channelCount: number;
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

/** Группы нет — общий текст сервиса групп и проверки `groupId` у занятия и канала. */
export const GROUP_NOT_FOUND_MESSAGE = 'Такой группы нет. Обновите список.';

/** Ключ уникальности названия: «Средние» и « средние » — одна группа. */
export function groupNameKey(name: string): string {
  return name.trim().toLowerCase();
}

/** Подпись занятия «для всех групп» — первая строка поста читается как есть
 * (ADR-0195), как её писал сайт школы. */
export const ALL_GROUPS_LABEL = 'все группы';
